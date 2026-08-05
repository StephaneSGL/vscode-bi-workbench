import {
  MeasureSchema,
  PageFilterSchema,
  ProjectSchema,
  ProjectThemeSchema,
  RelationshipSchema,
  TablePresentationSchema,
  VisualSchema,
  type BiProject,
  type ColumnProfile,
  type Measure,
  type PageFilter,
  type QueryResult,
  type ProjectTheme,
  type Relationship,
  type ReportPage,
  type TablePresentation,
  type TransformationStep,
  type Visual,
  type VisualData
} from '../shared/project.js';
import { DuckDbEngine } from './duckdbEngine.js';
import { ImportService } from './importService.js';
import { ModelService } from './modelService.js';
import { PowerBiExportService, type PowerBiExportResult } from './powerBiExportService.js';
import { ProjectStore, type OpenedProject } from './projectStore.js';
import { ReportService } from './reportService.js';
import { assertReadOnlyQuery, quoteIdentifier } from './sql.js';
import { TransformationService } from './transformationService.js';

export type ProjectChangeListener = (manager: ProjectManager) => void;

export class ProjectManager {
  readonly engine = new DuckDbEngine();
  private readonly store = new ProjectStore();
  private readonly imports = new ImportService(this.engine);
  private readonly transformations = new TransformationService(this.engine);
  private readonly model = new ModelService(this.engine);
  private readonly powerBiExport = new PowerBiExportService(this.engine);
  private readonly reports = new ReportService(this.engine);
  private opened?: OpenedProject;
  private dirtyState = false;
  private autoSaveState = true;
  private readonly listeners = new Set<ProjectChangeListener>();

  get project(): BiProject | undefined {
    return this.opened?.project;
  }

  get projectFile(): string | undefined {
    return this.opened?.projectFile;
  }

  get projectDirectory(): string | undefined {
    return this.opened?.projectDirectory;
  }

  get migratedFrom(): number | undefined {
    return this.opened?.migratedFrom;
  }

  get migrationBackupFile(): string | undefined {
    return this.opened?.migrationBackupFile;
  }

  get dirty(): boolean {
    return this.dirtyState;
  }

  set autoSave(enabled: boolean) {
    this.autoSaveState = enabled;
  }

  onDidChange(listener: ProjectChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async create(projectDirectory: string, name: string): Promise<void> {
    const opened = await this.store.create(projectDirectory, name);
    await this.activate(opened);
  }

  async open(projectFile: string): Promise<void> {
    const opened = await this.store.open(projectFile);
    await this.activate(opened);
  }

  async close(): Promise<void> {
    await this.engine.close();
    this.opened = undefined;
    this.dirtyState = false;
    this.emit();
  }

  async save(): Promise<void> {
    const opened = this.requireOpened();
    const persisted = this.withoutTemporaryFilters(opened.project);
    const saved = await this.store.save(opened.projectFile, persisted);
    opened.project = {
      ...opened.project,
      updatedAt: saved.updatedAt
    };
    this.dirtyState = false;
    this.emit();
  }

  async exportPowerBiProject(targetDirectory: string): Promise<PowerBiExportResult> {
    return this.powerBiExport.export(this.requireProject(), targetDirectory);
  }

  async importFile(filePath: string, targetName?: string): Promise<void> {
    const opened = this.requireOpened();
    const result = await this.imports.importFile(opened.project, {
      filePath,
      projectDirectory: opened.projectDirectory,
      ...(targetName ? { targetName } : {})
    });
    try {
      await this.commit((project) => ({
        ...project,
        sources: [...project.sources, result.source],
        tables: [...project.tables, ...result.tables]
      }));
    } catch (error) {
      await this.dropPhysicalTables(result.tables
        .filter((table) => !this.project?.tables.some((current) => current.id === table.id))
        .map((table) => table.physicalName));
      throw error;
    }
  }

  async previewTable(tableId: string, limit: number): Promise<QueryResult> {
    const table = this.requireTable(tableId);
    return this.engine.queryReadOnly(`SELECT * FROM "${table.physicalName.replaceAll('"', '""')}"`, limit);
  }

  async profileTable(tableId: string): Promise<ColumnProfile[]> {
    const table = this.requireTable(tableId);
    return this.engine.profileTable(table.physicalName, table.columns);
  }

  async runQuery(sql: string, limit: number): Promise<QueryResult> {
    assertReadOnlyQuery(sql);
    return this.engine.queryReadOnly(sql, limit);
  }

  async saveQuery(name: string, sql: string): Promise<void> {
    const safeSql = assertReadOnlyQuery(sql);
    await this.commit((project) => {
      const existing = project.queries.find((query) => query.name.toLowerCase() === name.toLowerCase());
      const now = new Date().toISOString();
      return {
        ...project,
        queries: existing
          ? project.queries.map((query) => query.id === existing.id ? { ...query, sql: safeSql, updatedAt: now } : query)
          : [...project.queries, { id: crypto.randomUUID(), name, sql: safeSql, createdAt: now, updatedAt: now }]
      };
    });
  }

  async createDerivedTable(sourceTableId: string, targetName: string, steps: readonly TransformationStep[]): Promise<void> {
    const project = this.requireProject();
    const table = await this.transformations.createDerivedTable(project, sourceTableId, targetName, steps);
    try {
      await this.commit((current) => ({ ...current, tables: [...current.tables, table] }));
    } catch (error) {
      if (!this.project?.tables.some((current) => current.id === table.id)) {
        await this.dropPhysicalTables([table.physicalName]);
      }
      throw error;
    }
  }

  async updateTablePresentation(tableId: string, presentation: TablePresentation): Promise<void> {
    const parsed = TablePresentationSchema.parse(presentation);
    const project = this.requireProject();
    const table = this.requireTable(tableId);
    const physicalColumns = new Set(table.columns.map((column) => column.name));
    const configuredColumns = new Set(parsed.columns.map((column) => column.name));
    if (configuredColumns.size !== parsed.columns.length || configuredColumns.size !== physicalColumns.size) {
      throw new Error('Table presentation must configure every physical column exactly once.');
    }
    for (const column of configuredColumns) {
      if (!physicalColumns.has(column)) {
        throw new Error(`Presentation references missing column "${column}".`);
      }
    }
    const duplicateDisplayName = firstDuplicate(parsed.columns.map((column) => column.displayName));
    if (duplicateDisplayName) {
      throw new Error(`Column display name "${duplicateDisplayName}" is duplicated.`);
    }
    const duplicateTable = project.tables.find((candidate) => candidate.id !== tableId && candidate.name.toLowerCase() === parsed.name.toLowerCase());
    if (duplicateTable) {
      throw new Error(`A table named "${parsed.name}" already exists.`);
    }

    await this.commit((current) => ({
      ...current,
      tables: current.tables.map((candidate) => candidate.id === tableId
        ? {
            ...candidate,
            name: parsed.name,
            description: parsed.description,
            columns: candidate.columns.map((column) => {
              const configured = parsed.columns.find((item) => item.name === column.name);
              return configured ? { ...column, ...configured } : column;
            })
          }
        : candidate)
    }));
  }

  async updateTheme(theme: ProjectTheme): Promise<void> {
    const parsed = ProjectThemeSchema.parse(theme);
    await this.commit((project) => ({ ...project, theme: parsed }));
  }

  async upsertRelationship(relationship: Relationship): Promise<void> {
    const parsed = RelationshipSchema.parse(relationship);
    this.model.validateRelationship(this.requireProject(), parsed);
    await this.commit((project) => ({
      ...project,
      relationships: project.relationships.some((item) => item.id === parsed.id)
        ? project.relationships.map((item) => item.id === parsed.id ? parsed : item)
        : [...project.relationships, parsed]
    }));
  }

  async deleteRelationship(relationshipId: string): Promise<void> {
    await this.commit((project) => ({
      ...project,
      relationships: project.relationships.filter((item) => item.id !== relationshipId)
    }));
  }

  async upsertMeasure(measure: Measure): Promise<unknown> {
    const parsed = MeasureSchema.parse(measure);
    const preview = await this.model.validateMeasure(this.requireProject(), parsed);
    await this.commit((project) => ({
      ...project,
      measures: project.measures.some((item) => item.id === parsed.id)
        ? project.measures.map((item) => item.id === parsed.id ? parsed : item)
        : [...project.measures, parsed]
    }));
    return preview;
  }

  async deleteMeasure(measureId: string): Promise<void> {
    await this.commit((project) => ({
      ...project,
      measures: project.measures.filter((item) => item.id !== measureId),
      reports: project.reports.map((report) => ({
        ...report,
        pages: report.pages.map((page) => ({
          ...page,
          visuals: page.visuals.map((visual) => visual.measureId === measureId
            ? { ...visual, measureId: undefined }
            : visual)
        }))
      }))
    }));
  }

  async addReport(name: string, description = '', pageName = 'Page 1', pageDescription = ''): Promise<string> {
    const project = this.requireProject();
    const normalizedName = name.trim();
    const normalizedPageName = pageName.trim();
    if (!normalizedName || !normalizedPageName) {
      throw new Error('Report and page names cannot be empty.');
    }
    if (project.reports.some((report) => report.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error(`A report named "${normalizedName}" already exists.`);
    }
    const reportId = crypto.randomUUID();
    const pageId = crypto.randomUUID();
    await this.commit((project) => ({
      ...project,
      reports: [...project.reports, {
        id: reportId,
        name: normalizedName,
        description: description.trim(),
        pages: [{ id: pageId, name: normalizedPageName, description: pageDescription.trim(), visuals: [], filters: [] }]
      }]
    }));
    return reportId;
  }

  async addPage(reportId: string, name: string): Promise<string> {
    const report = this.requireProject().reports.find((candidate) => candidate.id === reportId);
    const normalizedName = name.trim();
    if (!report) {
      throw new Error('Report not found.');
    }
    if (!normalizedName) {
      throw new Error('Page name cannot be empty.');
    }
    if (report.pages.some((page) => page.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error(`A page named "${normalizedName}" already exists in this report.`);
    }
    const pageId = crypto.randomUUID();
    await this.commit((project) => ({
      ...project,
      reports: project.reports.map((report) => report.id === reportId
        ? { ...report, pages: [...report.pages, { id: pageId, name: normalizedName, visuals: [], filters: [] }] }
        : report)
    }));
    return pageId;
  }

  async renameReport(reportId: string, name: string, description = ''): Promise<void> {
    const project = this.requireProject();
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Report name cannot be empty.');
    }
    if (!project.reports.some((report) => report.id === reportId)) {
      throw new Error('Report not found.');
    }
    if (project.reports.some((report) => report.id !== reportId && report.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error(`A report named "${normalizedName}" already exists.`);
    }
    await this.commit((current) => ({
      ...current,
      reports: current.reports.map((report) => report.id === reportId
        ? { ...report, name: normalizedName, description: description.trim() }
        : report)
    }));
  }

  async renamePage(reportId: string, pageId: string, name: string, description = ''): Promise<void> {
    const report = this.requireProject().reports.find((candidate) => candidate.id === reportId);
    const normalizedName = name.trim();
    if (!report?.pages.some((page) => page.id === pageId)) {
      throw new Error('Report page not found.');
    }
    if (!normalizedName) {
      throw new Error('Page name cannot be empty.');
    }
    if (report.pages.some((page) => page.id !== pageId && page.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error(`A page named "${normalizedName}" already exists in this report.`);
    }
    await this.updatePage(reportId, pageId, (page) => ({ ...page, name: normalizedName, description: description.trim() }));
  }

  async deleteReport(reportId: string): Promise<void> {
    const project = this.requireProject();
    if (project.reports.length <= 1) {
      throw new Error('A project must contain at least one report.');
    }
    await this.commit((current) => ({
      ...current,
      reports: current.reports.filter((report) => report.id !== reportId)
    }));
  }

  async deletePage(reportId: string, pageId: string): Promise<void> {
    const report = this.requireProject().reports.find((candidate) => candidate.id === reportId);
    if (!report) {
      throw new Error('Report not found.');
    }
    if (report.pages.length <= 1) {
      throw new Error('A report must contain at least one page.');
    }
    await this.commit((project) => ({
      ...project,
      reports: project.reports.map((candidate) => candidate.id === reportId
        ? { ...candidate, pages: candidate.pages.filter((page) => page.id !== pageId) }
        : candidate)
    }));
  }

  async upsertVisual(reportId: string, pageId: string, visual: Visual): Promise<void> {
    const parsed = VisualSchema.parse(visual);
    this.requirePage(reportId, pageId);
    this.requireTable(parsed.tableId);
    await this.reports.queryVisual(this.requireProject(), parsed, []);
    await this.updatePage(reportId, pageId, (page) => ({
      ...page,
      visuals: page.visuals.some((item) => item.id === parsed.id)
        ? page.visuals.map((item) => item.id === parsed.id ? parsed : item)
        : [...page.visuals, parsed]
    }));
  }

  async duplicateVisual(reportId: string, pageId: string, visualId: string): Promise<string> {
    const page = this.requirePage(reportId, pageId);
    const sourceIndex = page.visuals.findIndex((visual) => visual.id === visualId);
    const source = page.visuals[sourceIndex];
    if (!source) {
      throw new Error('Visual not found.');
    }
    const duplicate = VisualSchema.parse({ ...source, id: crypto.randomUUID(), title: `${source.title} copy` });
    await this.updatePage(reportId, pageId, (current) => ({
      ...current,
      visuals: [
        ...current.visuals.slice(0, sourceIndex + 1),
        duplicate,
        ...current.visuals.slice(sourceIndex + 1)
      ]
    }));
    return duplicate.id;
  }

  async reorderVisual(reportId: string, pageId: string, visualId: string, toIndex: number): Promise<void> {
    const page = this.requirePage(reportId, pageId);
    const sourceIndex = page.visuals.findIndex((visual) => visual.id === visualId);
    if (sourceIndex < 0) {
      throw new Error('Visual not found.');
    }
    const boundedIndex = Math.max(0, Math.min(page.visuals.length - 1, Math.trunc(toIndex)));
    await this.updatePage(reportId, pageId, (current) => {
      const visuals = [...current.visuals];
      const [visual] = visuals.splice(sourceIndex, 1);
      if (visual) {
        visuals.splice(boundedIndex, 0, visual);
      }
      return { ...current, visuals };
    });
  }

  async deleteVisual(reportId: string, pageId: string, visualId: string): Promise<void> {
    await this.updatePage(reportId, pageId, (page) => ({
      ...page,
      visuals: page.visuals.filter((item) => item.id !== visualId)
    }));
  }

  async upsertFilter(reportId: string, pageId: string, filter: PageFilter): Promise<void> {
    const parsed = PageFilterSchema.parse(filter);
    const table = this.requireTable(parsed.tableId);
    if (!table.columns.some((column) => column.name === parsed.column)) {
      throw new Error(`Filter field "${parsed.column}" does not exist in table "${table.name}".`);
    }
    await this.updatePage(reportId, pageId, (page) => ({
      ...page,
      filters: page.filters.some((item) => item.id === parsed.id)
        ? page.filters.map((item) => item.id === parsed.id ? parsed : item)
        : [...page.filters, parsed]
    }), !parsed.temporary);
  }

  async deleteFilter(reportId: string, pageId: string, filterId: string): Promise<void> {
    await this.updatePage(reportId, pageId, (page) => ({
      ...page,
      filters: page.filters.filter((item) => item.id !== filterId)
    }));
  }

  async setCrossFilter(reportId: string, pageId: string, filter: Omit<PageFilter, 'id' | 'temporary'>): Promise<void> {
    await this.updatePage(reportId, pageId, (page) => ({
      ...page,
      filters: [
        ...page.filters.filter((item) => !item.temporary),
        PageFilterSchema.parse({ ...filter, id: `cross_${filter.tableId}_${filter.column}`, temporary: true })
      ]
    }), false);
  }

  async clearTemporaryFilters(reportId: string, pageId: string): Promise<void> {
    await this.updatePage(reportId, pageId, (page) => ({
      ...page,
      filters: page.filters.filter((item) => !item.temporary)
    }), false);
  }

  async loadPage(reportId: string, pageId: string): Promise<VisualData[]> {
    const page = this.requirePage(reportId, pageId);
    return this.reports.loadPage(this.requireProject(), page);
  }

  requirePage(reportId: string, pageId: string): ReportPage {
    const report = this.requireProject().reports.find((candidate) => candidate.id === reportId);
    const page = report?.pages.find((candidate) => candidate.id === pageId);
    if (!page) {
      throw new Error('Report page not found.');
    }
    return page;
  }

  private async activate(opened: OpenedProject): Promise<void> {
    await this.engine.open(opened.databaseFile);
    this.opened = opened;
    this.dirtyState = false;
    this.emit();
  }

  private requireOpened(): OpenedProject {
    if (!this.opened) {
      throw new Error('No BI project is open.');
    }
    return this.opened;
  }

  private requireProject(): BiProject {
    return this.requireOpened().project;
  }

  private requireTable(tableId: string) {
    return this.model.requireTable(this.requireProject(), tableId);
  }

  private async updatePage(
    reportId: string,
    pageId: string,
    update: (page: ReportPage) => ReportPage,
    persist = true
  ): Promise<void> {
    this.requirePage(reportId, pageId);
    await this.commit((project) => ({
      ...project,
      reports: project.reports.map((report) => report.id === reportId
        ? { ...report, pages: report.pages.map((page) => page.id === pageId ? update(page) : page) }
        : report)
    }), persist);
  }

  private async commit(update: (project: BiProject) => BiProject, persist = true): Promise<void> {
    const opened = this.requireOpened();
    const candidate = ProjectSchema.parse(update(structuredClone(opened.project)));
    if (persist && this.autoSaveState) {
      const saved = await this.store.save(opened.projectFile, this.withoutTemporaryFilters(candidate));
      opened.project = { ...candidate, updatedAt: saved.updatedAt };
      this.dirtyState = false;
      this.emit();
      return;
    }
    opened.project = candidate;
    this.dirtyState = persist || this.dirtyState;
    this.emit();
  }

  private async dropPhysicalTables(tableNames: readonly string[]): Promise<void> {
    for (const tableName of tableNames) {
      try {
        await this.engine.runInternal(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
      } catch {
        // Preserve the metadata-save error; cleanup is deliberately best effort.
      }
    }
  }

  private withoutTemporaryFilters(project: BiProject): BiProject {
    return {
      ...project,
      reports: project.reports.map((report) => ({
        ...report,
        pages: report.pages.map((page) => ({
          ...page,
          filters: page.filters.filter((filter) => !filter.temporary)
        }))
      }))
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this);
    }
  }
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (seen.has(normalized)) {
      return value;
    }
    seen.add(normalized);
  }
  return undefined;
}
