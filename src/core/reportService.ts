import type {
  BiProject,
  PageFilter,
  QueryResult,
  ReportPage,
  TableModel,
  Visual,
  VisualData
} from '../shared/project.js';
import type { DuckDbEngine } from './duckdbEngine.js';
import { ModelService } from './modelService.js';
import { assertSafeMeasureExpression, compilePageFilters, quoteIdentifier } from './sql.js';

export class ReportService {
  private readonly modelService: ModelService;

  constructor(private readonly engine: DuckDbEngine) {
    this.modelService = new ModelService(engine);
  }

  async loadPage(project: BiProject, page: ReportPage): Promise<VisualData[]> {
    const results: VisualData[] = [];
    for (const visual of page.visuals) {
      try {
        const result = await this.queryVisual(project, visual, page.filters);
        results.push({
          visualId: visual.id,
          columns: result.columns,
          rows: result.rows,
          truncated: result.truncated
        });
      } catch (error) {
        results.push({
          visualId: visual.id,
          columns: [],
          rows: [],
          truncated: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return results;
  }

  async queryVisual(project: BiProject, visual: Visual, filters: readonly PageFilter[]): Promise<QueryResult> {
    const table = this.modelService.requireTable(project, visual.tableId);
    this.validateVisualFields(table, visual);
    const where = compilePageFilters(filters, table.id);
    const tableSql = quoteIdentifier(table.physicalName);

    if (visual.type === 'table') {
      const selectedColumns = visual.columns.length > 0 ? visual.columns : table.columns.slice(0, 12).map((column) => column.name);
      const fields = selectedColumns.map(quoteIdentifier).join(', ');
      return this.engine.queryInternal(
        `SELECT ${fields} FROM ${tableSql} WHERE ${where.sql} LIMIT ${visual.limit + 1}`,
        where.values,
        visual.limit
      );
    }

    if (visual.type === 'slicer') {
      if (!visual.categoryField) {
        throw new Error('A slicer requires a category field.');
      }
      return this.engine.queryInternal(
        `SELECT DISTINCT ${quoteIdentifier(visual.categoryField)} AS category FROM ${tableSql} WHERE ${where.sql} ORDER BY category NULLS LAST LIMIT ${visual.limit + 1}`,
        where.values,
        visual.limit
      );
    }

    const valueExpression = this.valueExpression(project, table, visual);
    if (visual.type === 'kpi') {
      return this.engine.queryInternal(
        `SELECT ${valueExpression} AS value FROM ${tableSql} WHERE ${where.sql}`,
        where.values,
        1
      );
    }

    if (!visual.categoryField) {
      throw new Error(`${visual.type} visual requires a category/X field.`);
    }
    const category = quoteIdentifier(visual.categoryField);
    const noAggregation = visual.aggregation === 'none' && !visual.measureId;
    const groupBy = noAggregation ? '' : ' GROUP BY 1';
    const orderBy = visual.type === 'line' || visual.type === 'area' || visual.type === 'scatter'
      ? ' ORDER BY 1 NULLS LAST'
      : ' ORDER BY 2 DESC NULLS LAST';
    return this.engine.queryInternal(
      `SELECT ${category} AS category, ${valueExpression} AS value FROM ${tableSql} WHERE ${where.sql}${groupBy}${orderBy} LIMIT ${visual.limit + 1}`,
      where.values,
      visual.limit
    );
  }

  private valueExpression(project: BiProject, table: TableModel, visual: Visual): string {
    if (visual.measureId) {
      const measure = project.measures.find((candidate) => candidate.id === visual.measureId);
      if (!measure) {
        throw new Error('The selected measure no longer exists.');
      }
      if (measure.tableId !== table.id) {
        throw new Error('Cross-table measures require relationship propagation, planned after v0.1.');
      }
      return assertSafeMeasureExpression(measure.expression);
    }

    if (visual.aggregation === 'count') {
      return 'COUNT(*)';
    }
    if (!visual.valueField) {
      throw new Error('The visual requires a value field or measure.');
    }
    const value = quoteIdentifier(visual.valueField);
    switch (visual.aggregation) {
      case 'none':
        return value;
      case 'countDistinct':
        return `COUNT(DISTINCT ${value})`;
      case 'sum':
        return `SUM(${value})`;
      case 'avg':
        return `AVG(${value})`;
      case 'min':
        return `MIN(${value})`;
      case 'max':
        return `MAX(${value})`;
    }
  }

  private validateVisualFields(table: TableModel, visual: Visual): void {
    const fields = new Set(table.columns.map((column) => column.name));
    const required = [visual.categoryField, visual.valueField, ...visual.columns].filter((field): field is string => Boolean(field));
    for (const field of required) {
      if (!fields.has(field)) {
        throw new Error(`Field "${field}" does not exist in table "${table.name}".`);
      }
    }
  }
}
