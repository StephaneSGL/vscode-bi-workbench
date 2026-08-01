import type { BiProject, TableModel, TransformationStep } from '../shared/project.js';
import type { DuckDbEngine } from './duckdbEngine.js';
import { compileTransformationPipeline, quoteIdentifier, uniquePhysicalName } from './sql.js';

export class TransformationService {
  constructor(private readonly engine: DuckDbEngine) {}

  async createDerivedTable(
    project: BiProject,
    sourceTableId: string,
    targetName: string,
    steps: readonly TransformationStep[]
  ): Promise<TableModel> {
    const source = project.tables.find((table) => table.id === sourceTableId);
    if (!source) {
      throw new Error('The source table no longer exists.');
    }
    this.validateSteps(source, steps);

    const physicalName = uniquePhysicalName(targetName, project.tables.map((table) => table.physicalName));
    const temporaryName = `__bi_transform_${crypto.randomUUID().replaceAll('-', '')}`;
    const compiled = compileTransformationPipeline(source.physicalName, steps);

    await this.engine.transaction(async (transaction) => {
      await transaction.run(`CREATE TABLE ${quoteIdentifier(temporaryName)} AS ${compiled.sql}`, compiled.values);
      await transaction.run(`ALTER TABLE ${quoteIdentifier(temporaryName)} RENAME TO ${quoteIdentifier(physicalName)}`);
    });

    const columns = await this.engine.describeTable(physicalName);
    const rowCount = await this.engine.tableRowCount(physicalName);
    return {
      id: crypto.randomUUID(),
      name: targetName.trim(),
      physicalName,
      kind: 'derived',
      sourceTableId,
      columns,
      rowCount,
      transformations: [...steps]
    };
  }

  private validateSteps(source: TableModel, steps: readonly TransformationStep[]): void {
    if (steps.length === 0) {
      throw new Error('At least one transformation step is required.');
    }
    let columns = source.columns.map((column) => column.name);
    const ensureColumn = (name: string, stepIndex: number): void => {
      if (!columns.some((column) => column.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Transformation step ${stepIndex + 1} references missing column "${name}".`);
      }
    };

    steps.forEach((step, index) => {
      switch (step.type) {
        case 'select':
          step.columns.forEach((column) => ensureColumn(column, index));
          columns = [...step.columns];
          break;
        case 'rename':
          ensureColumn(step.column, index);
          if (columns.some((column) => column.toLowerCase() === step.newName.toLowerCase() && column.toLowerCase() !== step.column.toLowerCase())) {
            throw new Error(`Transformation step ${index + 1} would create duplicate column "${step.newName}".`);
          }
          columns = columns.map((column) => column.toLowerCase() === step.column.toLowerCase() ? step.newName : column);
          break;
        case 'cast':
        case 'filter':
        case 'fillNull':
        case 'sort':
          ensureColumn(step.column, index);
          break;
        case 'deduplicate':
          break;
      }
    });
  }
}
