import type { BiProject, Measure, Relationship, TableModel } from '../shared/project.js';
import type { DuckDbEngine } from './duckdbEngine.js';
import { assertSafeMeasureExpression, quoteIdentifier } from './sql.js';

export class ModelService {
  constructor(private readonly engine: DuckDbEngine) {}

  validateRelationship(project: BiProject, relationship: Relationship): void {
    if (relationship.fromTableId === relationship.toTableId && relationship.fromColumn === relationship.toColumn) {
      throw new Error('A relationship cannot connect a column to itself.');
    }
    const fromTable = this.requireTable(project, relationship.fromTableId);
    const toTable = this.requireTable(project, relationship.toTableId);
    const fromColumn = fromTable.columns.find((column) => column.name === relationship.fromColumn);
    const toColumn = toTable.columns.find((column) => column.name === relationship.toColumn);
    if (!fromColumn) {
      throw new Error(`Column ${relationship.fromColumn} does not exist in ${fromTable.name}.`);
    }
    if (!toColumn) {
      throw new Error(`Column ${relationship.toColumn} does not exist in ${toTable.name}.`);
    }
    const fromFamily = this.typeFamily(fromColumn.dataType);
    const toFamily = this.typeFamily(toColumn.dataType);
    if (fromFamily !== toFamily && fromFamily !== 'other' && toFamily !== 'other') {
      throw new Error(`Relationship type mismatch: ${fromColumn.dataType} cannot be safely related to ${toColumn.dataType}.`);
    }
    const duplicate = project.relationships.find((candidate) =>
      candidate.id !== relationship.id
      && candidate.fromTableId === relationship.fromTableId
      && candidate.fromColumn === relationship.fromColumn
      && candidate.toTableId === relationship.toTableId
      && candidate.toColumn === relationship.toColumn
    );
    if (duplicate) {
      throw new Error('This relationship already exists.');
    }
  }

  async validateMeasure(project: BiProject, measure: Measure): Promise<unknown> {
    const table = this.requireTable(project, measure.tableId);
    if (project.measures.some((candidate) => candidate.id !== measure.id && candidate.name.toLowerCase() === measure.name.toLowerCase())) {
      throw new Error(`A measure named "${measure.name}" already exists.`);
    }
    const expression = assertSafeMeasureExpression(measure.expression);
    const result = await this.engine.queryInternal(
      `SELECT ${expression} AS ${quoteIdentifier('__measure_value')} FROM ${quoteIdentifier(table.physicalName)}`,
      [],
      1
    );
    return result.rows[0]?.__measure_value;
  }

  requireTable(project: BiProject, tableId: string): TableModel {
    const table = project.tables.find((candidate) => candidate.id === tableId);
    if (!table) {
      throw new Error(`Table ${tableId} does not exist in the active project.`);
    }
    return table;
  }

  private typeFamily(type: string): 'numeric' | 'text' | 'temporal' | 'boolean' | 'other' {
    const normalized = type.toUpperCase();
    if (/(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE)/.test(normalized)) {
      return 'numeric';
    }
    if (/(CHAR|VARCHAR|STRING|TEXT|UUID|ENUM)/.test(normalized)) {
      return 'text';
    }
    if (/(DATE|TIME|TIMESTAMP|INTERVAL)/.test(normalized)) {
      return 'temporal';
    }
    if (/BOOL/.test(normalized)) {
      return 'boolean';
    }
    return 'other';
  }
}
