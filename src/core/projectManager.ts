import path from 'node:path';
import {
  MeasureSchema,
  PageFilterSchema,
  ProjectSchema,
  RelationshipSchema,
  VisualSchema,
  type BiProject,
  type ColumnProfile,
  type Measure,
  type PageFilter,
  type QueryResult,
  type Relationship,
  type ReportPage,
  type TransformationStep,
  type Visual,
  type VisualData
} from '../shared/project.js';
import { DuckDbEngine } from './duckdbEngine.js';
import { ImportService } from './importService.js';
import { ModelService } from './modelService.js';
import { ProjectStore, type OpenedProject } from './projectStore.js';
import { ReportService } from './reportService.js';
import { assertReadOnlyQuery } from './sql.js';
import { TransformationService } from './transformationService.js';

export type ProjectChangeListener = (manager: ProjectManager) => void;

export class ProjectManager {
  readonly engine = new DuckDbEngine();
  private readonly store = new ProjectStore();
  private readonly imports = new ImportService(this.engine);
  private readonly transformations = new TransformationService(this.engine);
  private readonly model = new ModelService(this.engine);
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

  async importFile(filePath: string, targetName?: string): Promise<void> {
    const opened = this.requireOpened();
    const result = await this.imports.importFile(opened.project, {
      filePath,
      projectDirectory: opened.projectDirectory,
      ...(targetName ? { targetName } : {})
    });
    await this.commit((project) => ({
      ...project,
      sources: [...project.sources, result.source],
      tables: [...project.tables, ...result.tables]
    }));
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
    await this.commit((current) => ({ ...current, tables: [...current.tables, table] }));
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

  async addReport(name: string): Promise<string> {
    const reportId = crypto.randomUUID();
    await this.commit((project) => ({
      ...project,
      reports: [...project.reports, {
        id: reportId,
        name,
        pages: [{ id: crypto.randomUUID(), name: 'Page 1', visuals: [], filters: [] }]
      }]
    }));
    return reportId;
  }

  async addPage(reportId: string, name: string): Promise<string> {
    const pageId = crypto.randomUUID();
    await this.commit((project) => ({
      ...project,
      reports: project.reports.map((report) => report.id === reportId
        ? { ...report, pages: [...report.pages, { id: pageId, name, visuals: [], filters: [] }] }
        : report)
    }));
    return pageId;
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
    this.requireTable(parsed.tableId);
    await this.updatePage(reportId, pageId, (page) => ({
      ...page,
      visuals: page.visuals.some((item) => item.id === parsed.id)
        ? page.visuals.map((item) => item.id === parsed.id ? parsed : item)
        : [...page.visuals, parsed]
    }));
  }

  async deleteVisual(reportId: string, pageId: string, visualId: string): Promise<void> {
    await this.updatePage(reportId, pageId, (page) => ({
      ...page,
      visuals: page.visuals.filter((item) => item.id !== visualId)
    }));
  }

  async upsertFilter(reportId: string, pageId: string, filter: PageFilter): Promise<void> {
    const parsed = PageFilterSchema.parse(filter);
    this.requireTable(parsed.tableId);
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

  databaseFileSizePath(): string | undefined {
    return this.opened?.databaseFile;
  }

  sourceAbsolutePath(location: string): string {
    const opened = this.requireOpened();
    return path.isAbsolute(location) ? location : path.resolve(opened.projectDirectory, location.replaceAll('/', path.sep));
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
    opened.project = candidate;
    this.dirtyState = persist || this.dirtyState;
    if (persist && this.autoSaveState) {
      await this.save();
    } else {
      this.emit();
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
