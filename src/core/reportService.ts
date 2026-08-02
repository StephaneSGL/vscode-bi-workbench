import type {
  BiProject,
  PageFilter,
  QueryResult,
  Relationship,
  ReportPage,
  TableModel,
  Visual,
  VisualData
} from '../shared/project.js';
import type { DuckDbEngine } from './duckdbEngine.js';
import { ModelService } from './modelService.js';
import { assertSafeMeasureExpression, compileFilterExpression, quoteIdentifier, type SqlParameter } from './sql.js';

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
    if (visual.seriesField && ['table', 'kpi', 'pie', 'donut', 'slicer'].includes(visual.type)) {
      throw new Error(`${visual.type} visuals do not support a series field.`);
    }
    this.validateVisualFields(table, visual);
    const where = this.compileFilters(project, table, filters);
    const tableSql = `${quoteIdentifier(table.physicalName)} AS ${quoteIdentifier('t0')}`;

    if (visual.type === 'table') {
      const selectedColumns = visual.columns.length > 0
        ? visual.columns
        : table.columns.filter((column) => !column.hidden).slice(0, 12).map((column) => column.name);
      if (selectedColumns.length === 0) {
        throw new Error('The table visual has no visible columns.');
      }
      const fields = selectedColumns.map((name) => {
        const column = table.columns.find((candidate) => candidate.name === name);
        return `${qualified('t0', name)} AS ${quoteIdentifier(column?.displayName ?? name)}`;
      }).join(', ');
      const orderBy = visual.sortField
        ? ` ORDER BY ${qualified('t0', visual.sortField)} ${visual.sortDirection === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`
        : '';
      return this.engine.queryInternal(
        `SELECT ${fields} FROM ${tableSql} WHERE ${where.sql}${orderBy} LIMIT ${visual.limit + 1}`,
        where.values,
        visual.limit
      );
    }

    if (visual.type === 'slicer') {
      if (!visual.categoryField) {
        throw new Error('A slicer requires a category field.');
      }
      return this.engine.queryInternal(
        `SELECT DISTINCT ${qualified('t0', visual.categoryField)} AS category FROM ${tableSql} WHERE ${where.sql} ORDER BY category ${visual.sortDirection === 'desc' ? 'DESC' : 'ASC'} NULLS LAST LIMIT ${visual.limit + 1}`,
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
    const category = qualified('t0', visual.categoryField);
    const series = visual.seriesField ? qualified('t0', visual.seriesField) : undefined;
    const noAggregation = visual.aggregation === 'none' && !visual.measureId;
    const groupBy = noAggregation ? '' : ` GROUP BY ${series ? '1, 2' : '1'}`;
    const valuePosition = series ? 3 : 2;
    const explicitSortPosition = visual.sortField === visual.categoryField
      ? 1
      : visual.sortField === visual.seriesField && series
        ? 2
        : visual.sortField === visual.valueField
          ? valuePosition
          : visual.sortField
            ? valuePosition + 1
            : undefined;
    const sortProjection = visual.sortField && explicitSortPosition === valuePosition + 1
      ? `, ${noAggregation ? qualified('t0', visual.sortField) : `MAX(${qualified('t0', visual.sortField)})`} AS ${quoteIdentifier('__sort')}`
      : '';
    const orderBy = this.visualOrderBy(visual, valuePosition, explicitSortPosition);
    return this.engine.queryInternal(
      `SELECT ${category} AS category, ${series ? `${series} AS series, ` : ''}${valueExpression} AS value${sortProjection} FROM ${tableSql} WHERE ${where.sql}${groupBy}${orderBy} LIMIT ${visual.limit + 1}`,
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
        throw new Error('A visual must use a measure defined on the same source table. Cross-table measure expressions are not supported.');
      }
      return assertSafeMeasureExpression(measure.expression);
    }

    if (visual.aggregation === 'count') {
      return 'COUNT(*)';
    }
    if (!visual.valueField) {
      throw new Error('The visual requires a value field or measure.');
    }
    const value = qualified('t0', visual.valueField);
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
    const required = [visual.categoryField, visual.seriesField, visual.valueField, visual.sortField, ...visual.columns].filter((field): field is string => Boolean(field));
    for (const field of required) {
      if (!fields.has(field)) {
        throw new Error(`Field "${field}" does not exist in table "${table.name}".`);
      }
    }
  }

  private compileFilters(project: BiProject, baseTable: TableModel, filters: readonly PageFilter[]): { sql: string; values: SqlParameter[] } {
    const parts: string[] = [];
    const values: SqlParameter[] = [];
    const related = new Map<string, PageFilter[]>();
    for (const filter of filters) {
      const filterTable = this.modelService.requireTable(project, filter.tableId);
      if (!filterTable.columns.some((column) => column.name === filter.column)) {
        throw new Error(`Filter field "${filter.column}" does not exist in table "${filterTable.name}".`);
      }
      if (filter.tableId === baseTable.id) {
        const predicate = compileFilterExpression(qualified('t0', filter.column), filter.operator, filter.value, filter.secondValue);
        parts.push(`(${predicate.sql})`);
        values.push(...predicate.values);
      } else {
        const existing = related.get(filter.tableId) ?? [];
        existing.push(filter);
        related.set(filter.tableId, existing);
      }
    }

    let groupIndex = 0;
    for (const [filterTableId, tableFilters] of related) {
      const filterTable = this.modelService.requireTable(project, filterTableId);
      const path = this.findRelationshipPath(project, filterTableId, baseTable.id);
      if (!path) {
        continue;
      }
      const sourceAlias = `f${groupIndex}_0`;
      let currentAlias = sourceAlias;
      let fromSql = `${quoteIdentifier(filterTable.physicalName)} AS ${quoteIdentifier(sourceAlias)}`;
      for (const [stepIndex, step] of path.entries()) {
        const relationship = step.relationship;
        const currentColumn = relationshipColumn(relationship, step.fromTableId);
        const nextColumn = relationshipColumn(relationship, step.toTableId);
        if (stepIndex === path.length - 1) {
          parts.push(`EXISTS (SELECT 1 FROM ${fromSql} WHERE ${qualified(currentAlias, currentColumn)} = ${qualified('t0', nextColumn)} AND ${tableFilters.map((filter) => {
            const predicate = compileFilterExpression(qualified(sourceAlias, filter.column), filter.operator, filter.value, filter.secondValue);
            values.push(...predicate.values);
            return `(${predicate.sql})`;
          }).join(' AND ')})`);
        } else {
          const nextTable = this.modelService.requireTable(project, step.toTableId);
          const nextAlias = `f${groupIndex}_${stepIndex + 1}`;
          fromSql += ` JOIN ${quoteIdentifier(nextTable.physicalName)} AS ${quoteIdentifier(nextAlias)} ON ${qualified(currentAlias, currentColumn)} = ${qualified(nextAlias, nextColumn)}`;
          currentAlias = nextAlias;
        }
      }
      groupIndex += 1;
    }
    return { sql: parts.length > 0 ? parts.join(' AND ') : 'TRUE', values };
  }

  private findRelationshipPath(project: BiProject, sourceTableId: string, targetTableId: string): RelationshipPathStep[] | undefined {
    const queue: { tableId: string; steps: RelationshipPathStep[]; visited: Set<string> }[] = [
      { tableId: sourceTableId, steps: [], visited: new Set([sourceTableId]) }
    ];
    const matches: RelationshipPathStep[][] = [];
    let shortest: number | undefined;
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || (shortest !== undefined && current.steps.length >= shortest)) continue;
      for (const relationship of project.relationships.filter((item) => item.active)) {
        const nextTableId = propagationTarget(relationship, current.tableId);
        if (!nextTableId || current.visited.has(nextTableId)) continue;
        const steps = [...current.steps, { relationship, fromTableId: current.tableId, toTableId: nextTableId }];
        if (nextTableId === targetTableId) {
          shortest ??= steps.length;
          if (steps.length === shortest) matches.push(steps);
        } else if (shortest === undefined || steps.length < shortest) {
          queue.push({ tableId: nextTableId, steps, visited: new Set([...current.visited, nextTableId]) });
        }
      }
    }
    if (matches.length === 0) {
      return undefined;
    }
    if (matches.length > 1) {
      throw new Error('The semantic model contains multiple equally short filter paths. Remove the ambiguity or deactivate one relationship.');
    }
    return matches[0] ?? [];
  }

  private visualOrderBy(visual: Visual, valuePosition: number, explicitSortPosition?: number): string {
    const direction = visual.sortDirection === 'asc' ? 'ASC' : 'DESC';
    if (explicitSortPosition !== undefined) {
      return ` ORDER BY ${explicitSortPosition} ${direction} NULLS LAST`;
    }
    const automaticCategorySort = visual.type === 'line' || visual.type === 'area' || visual.type === 'scatter';
    const sortBy = visual.sortBy === 'auto' || !visual.sortBy
      ? automaticCategorySort ? 'category' : 'value'
      : visual.sortBy;
    return sortBy === 'category'
      ? ` ORDER BY 1 ${direction} NULLS LAST`
      : ` ORDER BY ${valuePosition} ${direction} NULLS LAST`;
  }
}

interface RelationshipPathStep {
  relationship: Relationship;
  fromTableId: string;
  toTableId: string;
}

function propagationTarget(relationship: Relationship, sourceTableId: string): string | undefined {
  if (relationship.filterDirection === 'both') {
    if (sourceTableId === relationship.fromTableId) return relationship.toTableId;
    if (sourceTableId === relationship.toTableId) return relationship.fromTableId;
    return undefined;
  }
  const [source, target] = relationship.cardinality === 'many-to-one'
    ? [relationship.toTableId, relationship.fromTableId]
    : [relationship.fromTableId, relationship.toTableId];
  return sourceTableId === source ? target : undefined;
}

function relationshipColumn(relationship: Relationship, tableId: string): string {
  if (relationship.fromTableId === tableId) return relationship.fromColumn;
  if (relationship.toTableId === tableId) return relationship.toColumn;
  throw new Error('Relationship path does not include the expected table.');
}

function qualified(alias: string, column: string): string {
  return `${quoteIdentifier(alias)}.${quoteIdentifier(column)}`;
}
