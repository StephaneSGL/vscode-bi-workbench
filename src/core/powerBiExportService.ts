import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BiProject,
  Column,
  Measure,
  Relationship,
  Report,
  ReportPage,
  TableModel,
  Visual
} from '../shared/project.js';
import type { DuckDbEngine } from './duckdbEngine.js';
import { escapeSqlString, quoteIdentifier } from './sql.js';

const PBIP_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json';
const PLATFORM_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json';
const PBISM_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json';
const PBIR_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json';
const VERSION_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json';
const REPORT_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.1.0/schema.json';
const PAGES_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json';
const PAGE_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json';
const VISUAL_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.9.0/schema.json';

const PAGE_WIDTH = 1280;
const MIN_PAGE_HEIGHT = 720;
const MAX_POWER_BI_FILE_PATH = 240;

export interface PowerBiExportCounts {
  tables: number;
  rows: number;
  measures: number;
  helperMeasures: number;
  relationships: number;
  reports: number;
  pages: number;
  visuals: number;
}

export interface PowerBiExportResult {
  targetDirectory: string;
  pbipFile: string;
  files: string[];
  warnings: string[];
  counts: PowerBiExportCounts;
}

interface ExportedColumn {
  source: Column;
  semanticName: string;
}

interface ExportedTable {
  source: TableModel;
  semanticName: string;
  csvFileName: string;
  tmdlFileName: string;
  finalCsvPath: string;
  columns: Map<string, ExportedColumn>;
}

interface ExportedMeasure {
  source: Measure;
  semanticName: string;
  dax: string;
  formatString: string;
}

interface VisualBuildContext {
  table: ExportedTable;
  measures: ReadonlyMap<string, ExportedMeasure>;
  rowCountMeasureName?: string;
}

interface BuiltVisual {
  data: Record<string, unknown>;
  source: Visual;
  name: string;
  position: VisualPosition;
}

interface VisualPosition {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  tabOrder: number;
}

interface MeasureTranslation {
  dax?: string;
  reason?: string;
}

interface ReportLayout {
  folderName: string;
  source: Report;
}

export class PowerBiExportService {
  constructor(private readonly engine: DuckDbEngine) {}

  async export(project: BiProject, targetDirectory: string): Promise<PowerBiExportResult> {
    const target = path.resolve(targetDirectory);
    const baseName = safePowerBiSegment(project.name, 'BI-Project', 40);
    const semanticFolderName = `Model-${stableHex(`semantic-folder:${project.id}`, 8)}.SemanticModel`;
    const reportLayouts = buildReportLayouts(project.reports);
    assertPowerBiPathBudget(target, baseName, semanticFolderName, reportLayouts);
    await assertTargetDoesNotExist(target);
    await mkdir(path.dirname(target), { recursive: true });

    const staging = path.join(path.dirname(target), `.${path.basename(target)}.biw-export-${randomUUID()}`);
    const warnings: string[] = [];
    const files: string[] = [];
    const counts: PowerBiExportCounts = {
      tables: 0,
      rows: 0,
      measures: 0,
      helperMeasures: 0,
      relationships: 0,
      reports: reportLayouts.length,
      pages: project.reports.reduce((total, report) => total + report.pages.length, 0),
      visuals: 0
    };

    try {
      await mkdir(staging, { recursive: false });
      const semanticRoot = path.join(staging, semanticFolderName);
      const semanticDefinition = path.join(semanticRoot, 'definition');
      const tablesDirectory = path.join(semanticDefinition, 'tables');
      const dataDirectory = path.join(staging, 'Data');
      await Promise.all([
        mkdir(tablesDirectory, { recursive: true }),
        mkdir(dataDirectory, { recursive: true })
      ]);

      const exportedTables = createExportedTables(project, target, warnings);
      for (const table of exportedTables.values()) {
        const stagingCsvPath = path.join(dataDirectory, table.csvFileName);
        const selections = [...table.columns.values()].map((column) =>
          `${quoteIdentifier(column.source.name)} AS ${quoteIdentifier(column.semanticName)}`
        ).join(', ');
        const copySql = `COPY (SELECT ${selections} FROM ${quoteIdentifier(table.source.physicalName)}) TO '${escapeSqlString(stagingCsvPath)}' (FORMAT CSV, HEADER true, FORCE_QUOTE *)`;
        await this.engine.runInternal(copySql);
        addFile(files, staging, stagingCsvPath);
        counts.tables += 1;
        counts.rows += table.source.rowCount;
      }

      const translatedMeasures = translateMeasures(project, exportedTables, warnings);
      counts.measures = translatedMeasures.size;
      const rowCountMeasures = buildRowCountMeasures(project, exportedTables, translatedMeasures);
      counts.helperMeasures = rowCountMeasures.size;

      await writeJsonTracked(
        path.join(semanticRoot, '.platform'),
        platformFile('SemanticModel', project.name, stableGuid(`semantic:${project.id}`)),
        staging,
        files
      );
      await writeJsonTracked(
        path.join(semanticRoot, 'definition.pbism'),
        {
          $schema: PBISM_SCHEMA,
          version: '4.2',
          settings: { qnaEnabled: true }
        },
        staging,
        files
      );
      await writeTextTracked(
        path.join(semanticDefinition, 'database.tmdl'),
        buildDatabaseTmdl(project),
        staging,
        files
      );
      await writeTextTracked(
        path.join(semanticDefinition, 'model.tmdl'),
        buildModelTmdl(exportedTables),
        staging,
        files
      );

      for (const table of exportedTables.values()) {
        const tableMeasures = [...translatedMeasures.values()].filter((measure) => measure.source.tableId === table.source.id);
        await writeTextTracked(
          path.join(tablesDirectory, table.tmdlFileName),
          buildTableTmdl(table, tableMeasures, rowCountMeasures.get(table.source.id)),
          staging,
          files
        );
      }

      const relationshipTmdl = buildRelationshipsTmdl(project.relationships, exportedTables, warnings);
      counts.relationships = relationshipTmdl.count;
      if (relationshipTmdl.content) {
        await writeTextTracked(
          path.join(semanticDefinition, 'relationships.tmdl'),
          relationshipTmdl.content,
          staging,
          files
        );
      }

      for (const reportLayout of reportLayouts) {
        counts.visuals += await this.writeReport(
          project,
          reportLayout,
          semanticFolderName,
          exportedTables,
          translatedMeasures,
          rowCountMeasures,
          staging,
          files,
          warnings
        );
      }

      const pbipPath = path.join(staging, `${baseName}.pbip`);
      await writeJsonTracked(
        pbipPath,
        {
          $schema: PBIP_SCHEMA,
          version: '1.0',
          artifacts: reportLayouts.map((report) => ({ report: { path: report.folderName } })),
          settings: { enableAutoRecovery: true }
        },
        staging,
        files
      );
      await writeTextTracked(
        path.join(staging, 'README-PowerBI.md'),
        buildExportReadme(project, `${baseName}.pbip`, warnings),
        staging,
        files
      );

      await rename(staging, target);
      return {
        targetDirectory: target,
        pbipFile: path.join(target, `${baseName}.pbip`),
        files: files.sort(),
        warnings,
        counts
      };
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async writeReport(
    project: BiProject,
    reportLayout: ReportLayout,
    semanticFolderName: string,
    exportedTables: ReadonlyMap<string, ExportedTable>,
    translatedMeasures: ReadonlyMap<string, ExportedMeasure>,
    rowCountMeasures: ReadonlyMap<string, string>,
    staging: string,
    files: string[],
    warnings: string[]
  ): Promise<number> {
    const report = reportLayout.source;
    const reportRoot = path.join(staging, reportLayout.folderName);
    const definition = path.join(reportRoot, 'definition');
    const pagesRoot = path.join(definition, 'pages');
    await mkdir(pagesRoot, { recursive: true });

    await writeJsonTracked(
      path.join(reportRoot, '.platform'),
      platformFile('Report', report.name, stableGuid(`report:${project.id}:${report.id}`), report.description),
      staging,
      files
    );
    await writeJsonTracked(
      path.join(reportRoot, 'definition.pbir'),
      {
        $schema: PBIR_SCHEMA,
        version: '4.0',
        datasetReference: { byPath: { path: `../${semanticFolderName}` } }
      },
      staging,
      files
    );
    await writeJsonTracked(
      path.join(definition, 'version.json'),
      { $schema: VERSION_SCHEMA, version: '2.0.0' },
      staging,
      files
    );
    await writeJsonTracked(
      path.join(definition, 'report.json'),
      {
        $schema: REPORT_SCHEMA,
        themeCollection: {},
        settings: { defaultFilterActionIsDataFilter: true }
      },
      staging,
      files
    );

    const pageNames = report.pages.map((page) => stableHex(`page:${report.id}:${page.id}`, 20));
    await writeJsonTracked(
      path.join(pagesRoot, 'pages.json'),
      {
        $schema: PAGES_SCHEMA,
        pageOrder: pageNames,
        ...(pageNames[0] ? { activePageName: pageNames[0] } : {})
      },
      staging,
      files
    );

    let visualCount = 0;
    for (const [pageIndex, page] of report.pages.entries()) {
      const pageName = pageNames[pageIndex];
      if (!pageName) continue;
      const written = await this.writePage(
        report,
        page,
        pageName,
        exportedTables,
        translatedMeasures,
        rowCountMeasures,
        pagesRoot,
        staging,
        files,
        warnings
      );
      visualCount += written;
    }
    return visualCount;
  }

  private async writePage(
    report: Report,
    page: ReportPage,
    pageName: string,
    exportedTables: ReadonlyMap<string, ExportedTable>,
    translatedMeasures: ReadonlyMap<string, ExportedMeasure>,
    rowCountMeasures: ReadonlyMap<string, string>,
    pagesRoot: string,
    staging: string,
    files: string[],
    warnings: string[]
  ): Promise<number> {
    const pageRoot = path.join(pagesRoot, pageName);
    const visualsRoot = path.join(pageRoot, 'visuals');
    await mkdir(visualsRoot, { recursive: true });

    const layout = layoutVisuals(page.visuals);
    const builtVisuals: BuiltVisual[] = [];
    for (const item of layout.visuals) {
      const table = exportedTables.get(item.visual.tableId);
      if (!table) {
        warnings.push(`Report "${report.name}" / page "${page.name}" / visual "${item.visual.title}" was omitted because its table was not exported.`);
        continue;
      }
      const built = buildVisual(item.visual, item.position, {
        table,
        measures: translatedMeasures,
        rowCountMeasureName: rowCountMeasures.get(table.source.id)
      });
      if (!built.data) {
        warnings.push(`Report "${report.name}" / page "${page.name}" / visual "${item.visual.title}" was omitted: ${built.reason ?? 'unsupported configuration'}.`);
        continue;
      }
      builtVisuals.push({
        data: built.data,
        source: item.visual,
        name: stableHex(`visual:${report.id}:${page.id}:${item.visual.id}`, 20),
        position: item.position
      });
    }

    const maxBottom = builtVisuals.reduce((maximum, visual) => Math.max(maximum, visual.position.y + visual.position.height), 0);
    const pageJson: Record<string, unknown> = {
      $schema: PAGE_SCHEMA,
      name: pageName,
      displayName: page.name,
      displayOption: 'FitToWidth',
      height: Math.max(MIN_PAGE_HEIGHT, maxBottom + 20),
      width: PAGE_WIDTH
    };
    const disabledInteractions = buildDisabledInteractions(builtVisuals);
    if (disabledInteractions.length > 0) {
      pageJson.visualInteractions = disabledInteractions;
    }
    await writeJsonTracked(path.join(pageRoot, 'page.json'), pageJson, staging, files);

    for (const visual of builtVisuals) {
      const visualDirectory = path.join(visualsRoot, visual.name);
      await mkdir(visualDirectory, { recursive: true });
      await writeJsonTracked(
        path.join(visualDirectory, 'visual.json'),
        {
          $schema: VISUAL_SCHEMA,
          name: visual.name,
          position: visual.position,
          visual: visual.data
        },
        staging,
        files
      );
    }

    const savedFilters = page.filters.filter((filter) => !filter.temporary);
    if (savedFilters.length > 0) {
      warnings.push(`Report "${report.name}" / page "${page.name}": ${savedFilters.length} saved page filter(s) were not exported; slicer visuals remain interactive.`);
    }
    return builtVisuals.length;
  }
}

function createExportedTables(project: BiProject, finalTarget: string, warnings: string[]): Map<string, ExportedTable> {
  const exported = new Map<string, ExportedTable>();
  const usedTableNames = new Set<string>();
  for (const table of project.tables) {
    if (table.columns.length === 0) {
      warnings.push(`Table "${table.name}" was omitted because it has no columns.`);
      continue;
    }
    const semanticName = uniqueSemanticName(table.name, usedTableNames);
    if (semanticName !== table.name) {
      warnings.push(`Table "${table.name}" was renamed to "${semanticName}" in Power BI to avoid a duplicate semantic name.`);
    }
    const usedColumnNames = new Set<string>();
    const columns = new Map<string, ExportedColumn>();
    for (const column of table.columns) {
      const requested = column.displayName?.trim() || column.name;
      const semanticColumnName = uniqueSemanticName(requested, usedColumnNames);
      if (semanticColumnName !== requested) {
        warnings.push(`Column "${table.name}.${requested}" was renamed to "${semanticColumnName}" in Power BI to avoid a duplicate semantic name.`);
      }
      columns.set(column.name, { source: column, semanticName: semanticColumnName });
    }
    const token = stableHex(`table:${table.id}`, 8);
    const fileBase = `Table-${token}`;
    const csvFileName = `${fileBase}.csv`;
    exported.set(table.id, {
      source: table,
      semanticName,
      csvFileName,
      tmdlFileName: `${fileBase}.tmdl`,
      finalCsvPath: path.join(finalTarget, 'Data', csvFileName),
      columns
    });
  }
  return exported;
}

function translateMeasures(
  project: BiProject,
  tables: ReadonlyMap<string, ExportedTable>,
  warnings: string[]
): Map<string, ExportedMeasure> {
  const exported = new Map<string, ExportedMeasure>();
  for (const measure of project.measures) {
    const table = tables.get(measure.tableId);
    if (!table) {
      warnings.push(`Measure "${measure.name}" was omitted because its table was not exported.`);
      continue;
    }
    const translation = translateSqlMeasureToDax(measure.expression, table.semanticName, new Map(
      [...table.columns.entries()].map(([physicalName, column]) => [physicalName, column.semanticName])
    ));
    if (!translation.dax) {
      warnings.push(`Measure "${measure.name}" was omitted because ${translation.reason ?? 'its DuckDB SQL expression has no safe DAX translation'}.`);
      continue;
    }
    exported.set(measure.id, {
      source: measure,
      semanticName: normalizeSemanticLabel(measure.name),
      dax: translation.dax,
      formatString: powerBiFormatString(measure.format)
    });
  }
  return exported;
}

function buildRowCountMeasures(
  project: BiProject,
  tables: ReadonlyMap<string, ExportedTable>,
  measures: ReadonlyMap<string, ExportedMeasure>
): Map<string, string> {
  const result = new Map<string, string>();
  const requiredTableIds = new Set(project.reports.flatMap((report) => report.pages.flatMap((page) =>
    page.visuals
      .filter((visual) => !visual.measureId && visual.aggregation === 'count' && visual.type !== 'table' && visual.type !== 'slicer')
      .map((visual) => visual.tableId)
  )));
  const usedNames = new Set([...measures.values()].map((measure) => measure.semanticName.toLowerCase()));
  for (const tableId of requiredTableIds) {
    if (!tables.has(tableId)) continue;
    let name = '_BIW Row Count';
    let suffix = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `_BIW Row Count ${suffix}`;
      suffix += 1;
    }
    usedNames.add(name.toLowerCase());
    result.set(tableId, name);
  }
  return result;
}

function buildDatabaseTmdl(project: BiProject): string {
  return [
    `database ${stableGuid(`database:${project.id}`)}`,
    '\tcompatibilityLevel: 1702',
    '\tcompatibilityMode: powerBI',
    '\tlanguage: 1033',
    ''
  ].join('\n');
}

function buildModelTmdl(tables: ReadonlyMap<string, ExportedTable>): string {
  const lines = [
    'model Model',
    '\tculture: en-US',
    '\tdefaultPowerBIDataSourceVersion: powerBI_V3',
    '\tsourceQueryCulture: en-US',
    ''
  ];
  for (const table of tables.values()) {
    lines.push(`ref table ${quoteTmdlIdentifier(table.semanticName)}`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildTableTmdl(table: ExportedTable, measures: readonly ExportedMeasure[], rowCountMeasureName?: string): string {
  const lines = [
    ...tmdlDescriptionLines(table.source.description ?? '', ''),
    `table ${quoteTmdlIdentifier(table.semanticName)}`,
    ''
  ];
  for (const measure of measures) {
    lines.push(...tmdlDescriptionLines(measure.source.description, '\t'));
    lines.push(`\tmeasure ${quoteTmdlIdentifier(measure.semanticName)} = ${measure.dax}`);
    lines.push(`\t\tformatString: ${measure.formatString}`);
    lines.push('');
  }
  if (rowCountMeasureName) {
    lines.push(`\tmeasure ${quoteTmdlIdentifier(rowCountMeasureName)} = COUNTROWS(${quoteDaxTable(table.semanticName)})`);
    lines.push('\t\tformatString: #,0');
    lines.push('\t\tisHidden');
    lines.push('');
  }
  for (const column of table.columns.values()) {
    lines.push(...tmdlDescriptionLines(column.source.description ?? '', '\t'));
    lines.push(`\tcolumn ${quoteTmdlIdentifier(column.semanticName)}`);
    lines.push(`\t\tdataType: ${toPowerBiDataType(column.source.dataType)}`);
    lines.push(`\t\tsourceColumn: ${tmdlPropertyScalar(column.semanticName)}`);
    if (column.source.hidden) {
      lines.push('\t\tisHidden');
    }
    if (shouldDisableSummarization(column.source)) {
      lines.push('\t\tsummarizeBy: none');
    }
    const format = columnPowerBiFormatString(column.source);
    if (format) {
      lines.push(`\t\tformatString: ${format}`);
    }
    lines.push('');
  }
  lines.push(`\tpartition ${quoteTmdlIdentifier(table.semanticName)} = m`);
  lines.push('\t\tmode: import');
  lines.push('\t\tsource =');
  lines.push('\t\t\tlet');
  lines.push(`\t\t\t\tSource = Csv.Document(File.Contents("${escapeMString(table.finalCsvPath)}"), [Delimiter = ",", Columns = ${table.columns.size}, Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),`);
  lines.push('\t\t\t\t#"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),');
  const typePairs = [...table.columns.values()].map((column) =>
    `{"${escapeMString(column.semanticName)}", ${toPowerQueryType(column.source.dataType)}}`
  );
  lines.push(`\t\t\t\t#"Changed Type" = Table.TransformColumnTypes(#"Promoted Headers", {${typePairs.join(', ')}}, "en-US")`);
  lines.push('\t\t\tin');
  lines.push('\t\t\t\t#"Changed Type"');
  lines.push('');
  return lines.join('\n');
}

function buildRelationshipsTmdl(
  relationships: readonly Relationship[],
  tables: ReadonlyMap<string, ExportedTable>,
  warnings: string[]
): { content?: string; count: number } {
  const lines: string[] = [];
  let count = 0;
  for (const relationship of relationships) {
    const fromTable = tables.get(relationship.fromTableId);
    const toTable = tables.get(relationship.toTableId);
    const fromColumn = fromTable?.columns.get(relationship.fromColumn);
    const toColumn = toTable?.columns.get(relationship.toColumn);
    if (!fromTable || !toTable || !fromColumn || !toColumn) {
      warnings.push(`Relationship "${relationship.id}" was omitted because a referenced table or column was not exported.`);
      continue;
    }
    const reverseEndpoints = relationship.cardinality === 'one-to-many'
      || relationship.cardinality === 'many-to-many';
    const tmdlFromTable = reverseEndpoints ? toTable : fromTable;
    const tmdlToTable = reverseEndpoints ? fromTable : toTable;
    const tmdlFromColumn = reverseEndpoints ? toColumn : fromColumn;
    const tmdlToColumn = reverseEndpoints ? fromColumn : toColumn;
    const fromCardinality = relationship.cardinality === 'one-to-one' ? 'one' : 'many';
    const toCardinality = relationship.cardinality === 'many-to-many' ? 'many' : 'one';
    const crossFilteringBehavior = relationship.filterDirection === 'both'
      || relationship.cardinality === 'one-to-one'
      ? 'bothDirections'
      : 'oneDirection';
    if (relationship.cardinality === 'one-to-one' && relationship.filterDirection === 'single') {
      warnings.push(`Relationship "${relationship.id}" uses one-to-one cardinality; Power BI requires bidirectional filtering, so it was exported as bothDirections.`);
    }
    lines.push(`relationship ${quoteTmdlIdentifier(stableGuid(`relationship:${relationship.id}`))}`);
    lines.push(`\tfromCardinality: ${fromCardinality}`);
    lines.push(`\ttoCardinality: ${toCardinality}`);
    lines.push(`\tcrossFilteringBehavior: ${crossFilteringBehavior}`);
    if (!relationship.active) {
      lines.push('\tisActive: false');
    }
    lines.push(`\tfromColumn: ${quoteTmdlIdentifier(tmdlFromTable.semanticName)}.${quoteTmdlIdentifier(tmdlFromColumn.semanticName)}`);
    lines.push(`\ttoColumn: ${quoteTmdlIdentifier(tmdlToTable.semanticName)}.${quoteTmdlIdentifier(tmdlToColumn.semanticName)}`);
    lines.push('');
    count += 1;
  }
  return { ...(lines.length > 0 ? { content: `${lines.join('\n')}\n` } : {}), count };
}

function buildVisual(
  visual: Visual,
  position: VisualPosition,
  context: VisualBuildContext
): { data?: Record<string, unknown>; reason?: string } {
  const visualType = powerBiVisualType(visual.type);
  const queryState: Record<string, { projections: Record<string, unknown>[] }> = {};

  const addColumn = (role: string, physicalName: string | undefined): string | undefined => {
    if (!physicalName) return `role ${role} has no configured field`;
    const column = context.table.columns.get(physicalName);
    if (!column) return `field "${physicalName}" no longer exists`;
    queryState[role] = { projections: [columnProjection(context.table.semanticName, column.semanticName)] };
    return undefined;
  };
  const addValue = (role: string): string | undefined => {
    if (visual.measureId) {
      const measure = context.measures.get(visual.measureId);
      if (!measure) return 'its selected measure could not be translated safely to DAX';
      queryState[role] = { projections: [measureProjection(context.table.semanticName, measure.semanticName)] };
      return undefined;
    }
    if (visual.aggregation === 'count') {
      if (!context.rowCountMeasureName) return 'a row-count helper measure could not be created';
      queryState[role] = { projections: [measureProjection(context.table.semanticName, context.rowCountMeasureName)] };
      return undefined;
    }
    if (visual.aggregation === 'none') {
      return 'Power BI chart value roles require a measure or aggregation, while this visual uses an unaggregated value';
    }
    if (!visual.valueField) return 'it has no value field or measure';
    const column = context.table.columns.get(visual.valueField);
    if (!column) return `field "${visual.valueField}" no longer exists`;
    queryState[role] = {
      projections: [aggregationProjection(
        context.table.semanticName,
        column.semanticName,
        aggregationFunction(visual.aggregation)
      )]
    };
    return undefined;
  };

  let reason: string | undefined;
  switch (visual.type) {
    case 'table': {
      const selected = visual.columns.length > 0
        ? visual.columns
        : [...context.table.columns.values()].filter((column) => !column.source.hidden).slice(0, 12).map((column) => column.source.name);
      const projections: Record<string, unknown>[] = [];
      for (const field of selected) {
        const column = context.table.columns.get(field);
        if (!column) return { reason: `field "${field}" no longer exists` };
        projections.push(columnProjection(context.table.semanticName, column.semanticName));
      }
      if (visual.measureId) {
        const measure = context.measures.get(visual.measureId);
        if (!measure) return { reason: 'its selected measure could not be translated safely to DAX' };
        projections.push(measureProjection(context.table.semanticName, measure.semanticName));
      }
      if (projections.length === 0) return { reason: 'it has no visible fields' };
      queryState.Values = { projections };
      break;
    }
    case 'kpi':
      reason = addValue('Data');
      break;
    case 'slicer':
      reason = addColumn('Values', visual.categoryField);
      break;
    case 'scatter':
      reason = addColumn('X', visual.categoryField) ?? addValue('Y');
      if (!reason && visual.seriesField) reason = addColumn('Series', visual.seriesField);
      break;
    default:
      reason = addColumn('Category', visual.categoryField) ?? addValue('Y');
      if (!reason && visual.seriesField) reason = addColumn('Series', visual.seriesField);
      break;
  }
  if (reason) return { reason };

  const visualConfiguration: Record<string, unknown> = {
    visualType,
    query: { queryState },
    visualContainerObjects: {
      title: [{
        properties: {
          show: pbirLiteral('true'),
          text: pbirLiteral(`'${visual.title.replaceAll("'", "''")}'`)
        }
      }]
    }
  };
  if (visual.type === 'slicer') {
    visualConfiguration.objects = {
      data: [{ properties: { mode: pbirLiteral("'Dropdown'") } }]
    };
  }
  return { data: visualConfiguration };
}

function buildDisabledInteractions(visuals: readonly BuiltVisual[]): Record<string, unknown>[] {
  return visuals.flatMap((source) => source.source.interactionMode === 'none'
    ? visuals.filter((target) => target.name !== source.name).map((target) => ({
        source: source.name,
        target: target.name,
        type: 'NoFilter'
      }))
    : []
  );
}

function powerBiVisualType(type: Visual['type']): string {
  return ({
    table: 'tableEx',
    kpi: 'cardVisual',
    bar: 'clusteredColumnChart',
    horizontalBar: 'clusteredBarChart',
    line: 'lineChart',
    area: 'areaChart',
    pie: 'pieChart',
    donut: 'donutChart',
    scatter: 'scatterChart',
    slicer: 'slicer'
  } as const)[type];
}

function columnProjection(table: string, column: string): Record<string, unknown> {
  const queryRef = `${table}.${column}`;
  return {
    field: { Column: { Expression: { SourceRef: { Entity: table } }, Property: column } },
    queryRef,
    nativeQueryRef: column
  };
}

function measureProjection(table: string, measure: string): Record<string, unknown> {
  const queryRef = `${table}.${measure}`;
  return {
    field: { Measure: { Expression: { SourceRef: { Entity: table } }, Property: measure } },
    queryRef,
    nativeQueryRef: measure
  };
}

function aggregationProjection(table: string, column: string, aggregateFunction: number): Record<string, unknown> {
  const labels = ['Sum', 'Average', 'DistinctCount', 'Min', 'Max', 'Count'];
  const label = labels[aggregateFunction] ?? 'Aggregation';
  return {
    field: {
      Aggregation: {
        Expression: { Column: { Expression: { SourceRef: { Entity: table } }, Property: column } },
        Function: aggregateFunction
      }
    },
    queryRef: `${label}(${table}.${column})`,
    nativeQueryRef: `${label} of ${column}`
  };
}

function aggregationFunction(aggregation: Visual['aggregation']): number {
  switch (aggregation) {
    case 'sum': return 0;
    case 'avg': return 1;
    case 'countDistinct': return 2;
    case 'min': return 3;
    case 'max': return 4;
    case 'count': return 5;
    case 'none': return 0;
  }
}

function layoutVisuals(visuals: readonly Visual[]): { visuals: { visual: Visual; position: VisualPosition }[] } {
  const result: { visual: Visual; position: VisualPosition }[] = [];
  let column = 0;
  let row = 0;
  let rowHeight = 0;
  for (const [index, visual] of visuals.entries()) {
    const widthUnits = Math.max(1, Math.min(12, visual.width));
    const heightUnits = Math.max(2, Math.min(12, visual.height));
    if (column > 0 && column + widthUnits > 12) {
      row += rowHeight;
      column = 0;
      rowHeight = 0;
    }
    result.push({
      visual,
      position: {
        x: 20 + column * 100,
        y: 20 + row * 80,
        z: index,
        width: widthUnits * 100 - 16,
        height: heightUnits * 80 - 16,
        tabOrder: index
      }
    });
    column += widthUnits;
    rowHeight = Math.max(rowHeight, heightUnits);
  }
  return { visuals: result };
}

function buildReportLayouts(reports: readonly Report[]): ReportLayout[] {
  return reports.map((report, index) => ({
    source: report,
    folderName: `Report-${index + 1}-${stableHex(`report-folder:${report.id}`, 8)}.Report`
  }));
}

function platformFile(type: 'Report' | 'SemanticModel', displayName: string, logicalId: string, description?: string): Record<string, unknown> {
  return {
    $schema: PLATFORM_SCHEMA,
    metadata: {
      type,
      displayName,
      ...(description?.trim() ? { description: description.trim() } : {})
    },
    config: { version: '2.0', logicalId }
  };
}

function buildExportReadme(project: BiProject, pbipFileName: string, warnings: readonly string[]): string {
  return `# ${project.name} - Power BI Desktop Project\n\n` +
    `Generated locally by BI Workbench. Open \`${pbipFileName}\` with Power BI Desktop. Refresh the semantic model if Power BI asks for it, then use **File > Save As** to create a \`.pbix\` copy.\n\n` +
    `The \`Data\` folder contains a complete CSV copy of every exported BI Workbench table. Treat this folder as sensitive data. The Power Query partitions contain absolute paths to these CSV files; moving the project requires updating those paths in Power BI Desktop.\n\n` +
    `PBIR and TMDL are documented Power BI project formats. The proprietary PBIX container is not generated directly.\n\n` +
    `## Export warnings\n\n` +
    (warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join('\n') : '- None.') + '\n';
}

export function translateSqlMeasureToDax(
  expression: string,
  semanticTableName: string,
  semanticColumns: ReadonlyMap<string, string>
): MeasureTranslation {
  const normalized = expression.trim();
  if (/^COUNT\s*\(\s*\*\s*\)$/i.test(normalized)) {
    return { dax: `COUNTROWS(${quoteDaxTable(semanticTableName)})` };
  }

  const distinct = normalized.match(/^COUNT\s*\(\s*DISTINCT\s+(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_]*))\s*\)$/i);
  if (distinct) {
    const column = resolveMeasureColumn(distinct[1], distinct[2], semanticColumns);
    if (!column) return { reason: 'its COUNT DISTINCT column does not exist' };
    const reference = `${quoteDaxTable(semanticTableName)}${quoteDaxColumn(column)}`;
    return { dax: `COUNTROWS(FILTER(VALUES(${reference}), NOT ISBLANK(${reference})))` };
  }

  const aggregate = normalized.match(/^(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_]*))\s*\)$/i);
  if (!aggregate) {
    return { reason: 'only SUM, AVG, MIN, MAX, COUNT, COUNT(*), and COUNT(DISTINCT column) have a safe automatic DAX translation' };
  }
  const column = resolveMeasureColumn(aggregate[2], aggregate[3], semanticColumns);
  if (!column) return { reason: 'its referenced column does not exist' };
  const daxFunction = ({ SUM: 'SUM', AVG: 'AVERAGE', MIN: 'MIN', MAX: 'MAX', COUNT: 'COUNTA' } as const)[aggregate[1]?.toUpperCase() as 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT'];
  return { dax: `${daxFunction}(${quoteDaxTable(semanticTableName)}${quoteDaxColumn(column)})` };
}

function resolveMeasureColumn(
  quoted: string | undefined,
  plain: string | undefined,
  semanticColumns: ReadonlyMap<string, string>
): string | undefined {
  const physicalName = quoted !== undefined ? quoted.replaceAll('""', '"') : plain;
  if (!physicalName) return undefined;
  for (const [source, semantic] of semanticColumns) {
    if (source.toLowerCase() === physicalName.toLowerCase()) return semantic;
  }
  return undefined;
}

export function toPowerBiDataType(dataType: string): 'boolean' | 'dateTime' | 'double' | 'int64' | 'string' {
  const normalized = dataType.toUpperCase();
  if (/BOOL/.test(normalized)) return 'boolean';
  if (/(DATE|TIME|TIMESTAMP)/.test(normalized)) return 'dateTime';
  if (/^(TINYINT|SMALLINT|INTEGER|INT|BIGINT)\b/.test(normalized)) return 'int64';
  if (/(DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE|HUGEINT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)/.test(normalized)) return 'double';
  return 'string';
}

function toPowerQueryType(dataType: string): string {
  const normalized = dataType.toUpperCase();
  if (/BOOL/.test(normalized)) return 'type logical';
  if (/TIMESTAMP.*TZ|TIMESTAMPTZ/.test(normalized)) return 'type datetimezone';
  if (/TIMESTAMP|DATETIME/.test(normalized)) return 'type datetime';
  if (/^DATE\b/.test(normalized)) return 'type date';
  if (/^TIME\b/.test(normalized)) return 'type time';
  if (/^(TINYINT|SMALLINT|INTEGER|INT|BIGINT)\b/.test(normalized)) return 'Int64.Type';
  if (/(DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE|HUGEINT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)/.test(normalized)) return 'type number';
  return 'type text';
}

export function safePowerBiSegment(value: string, fallback: string, maxLength = 70): string {
  const withoutControlCharacters = [...value].map((character) => character.charCodeAt(0) < 32 ? '-' : character).join('');
  const normalized = withoutControlCharacters
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[. -]+|[. -]+$/g, '')
    .slice(0, maxLength);
  const candidate = normalized || fallback;
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(candidate) ? `BI-${candidate}` : candidate;
}

export function quoteTmdlIdentifier(value: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return value;
  return `'${value.replaceAll("'", "''")}'`;
}

function tmdlPropertyScalar(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

function tmdlDescriptionLines(value: string, indent: string): string[] {
  const words = value.replace(/[\r\n\t]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > 76) {
      lines.push(`${indent}/// ${current}`);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(`${indent}/// ${current}`);
  return lines;
}

function quoteDaxTable(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteDaxColumn(value: string): string {
  return `[${value.replaceAll(']', ']]')}]`;
}

function escapeMString(value: string): string {
  return value.replaceAll('"', '""');
}

function pbirLiteral(value: string): Record<string, unknown> {
  return { expr: { Literal: { Value: value } } };
}

function powerBiFormatString(format: Measure['format']): string {
  switch (format) {
    case 'integer': return '#,0';
    case 'percent': return '0.00%';
    case 'number': return '#,0.00';
    case 'currency': return '#,0.00';
    case 'text': return '0';
  }
}

function columnPowerBiFormatString(column: Column): string | undefined {
  switch (column.format) {
    case 'integer': return '#,0';
    case 'number': return '#,0.00';
    case 'currency': return '#,0.00';
    case 'percent': return '0.00%';
    case 'date': return 'yyyy-MM-dd';
    case 'datetime': return 'yyyy-MM-dd HH:mm:ss';
    case 'text': return undefined;
    case 'auto':
    case undefined:
      return undefined;
  }
}

function shouldDisableSummarization(column: Column): boolean {
  return toPowerBiDataType(column.dataType) === 'string'
    || toPowerBiDataType(column.dataType) === 'boolean'
    || toPowerBiDataType(column.dataType) === 'dateTime'
    || ['identifier', 'category', 'geography', 'date'].includes(column.semanticType ?? 'auto');
}

function uniqueSemanticName(requested: string, used: Set<string>): string {
  const base = normalizeSemanticLabel(requested);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function normalizeSemanticLabel(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim() || 'Unnamed';
}

function stableHex(value: string, length: number): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, length);
}

function stableGuid(value: string): string {
  const bytes = Buffer.from(createHash('sha256').update(value, 'utf8').digest().subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function assertTargetDoesNotExist(target: string): Promise<void> {
  try {
    await stat(target);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Power BI export target already exists: ${target}`);
}

function assertPowerBiPathBudget(
  target: string,
  baseName: string,
  semanticFolderName: string,
  reportLayouts: readonly ReportLayout[]
): void {
  const candidates = [
    path.join(target, `${baseName}.pbip`),
    path.join(target, semanticFolderName, 'definition', 'tables', 'Table-00000000.tmdl'),
    ...reportLayouts.map((report) => path.join(
      target,
      report.folderName,
      'definition',
      'pages',
      '00000000000000000000',
      'visuals',
      '00000000000000000000',
      'visual.json'
    ))
  ];
  const longest = candidates.reduce((maximum, candidate) => Math.max(maximum, candidate.length), 0);
  if (longest > MAX_POWER_BI_FILE_PATH) {
    throw new Error(
      `The Power BI export destination is too deep for Power BI Desktop (${longest} characters; maximum ${MAX_POWER_BI_FILE_PATH}). Choose a parent folder closer to the drive root, such as C:\\BI-Exports.`
    );
  }
}

async function writeJsonTracked(
  filePath: string,
  value: unknown,
  root: string,
  files: string[]
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  addFile(files, root, filePath);
}

async function writeTextTracked(
  filePath: string,
  value: string,
  root: string,
  files: string[]
): Promise<void> {
  await writeFile(filePath, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
  addFile(files, root, filePath);
}

function addFile(files: string[], root: string, filePath: string): void {
  files.push(path.relative(root, filePath).split(path.sep).join('/'));
}
