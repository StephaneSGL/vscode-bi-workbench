import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectManager } from '../../src/core/projectManager.js';

describe('ProjectManager end-to-end', () => {
  let root: string;
  let manager: ProjectManager;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'bi-workbench-project-'));
    manager = new ProjectManager();
  });

  afterEach(async () => {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  });

  it('persists import, transformation, relationship, measure, and report visual', async () => {
    const projectDir = path.join(root, 'retail');
    await manager.create(projectDir, 'Retail');
    const csv = path.join(root, 'sales.csv');
    await writeFile(csv, 'region,amount\nNorth,10\nSouth,25\nSouth,30\n', 'utf8');
    await manager.importFile(csv);
    const source = manager.project?.tables[0];
    expect(source?.rowCount).toBe(3);

    await manager.createDerivedTable(source?.id ?? '', 'Large Sales', [
      { id: 'filter', label: 'Amount > 20', type: 'filter', column: 'amount', operator: 'gt', value: 20 }
    ]);
    const derived = manager.project?.tables[1];
    expect(derived?.rowCount).toBe(2);

    await manager.upsertRelationship({
      id: crypto.randomUUID(), fromTableId: derived?.id ?? '', fromColumn: 'region', toTableId: source?.id ?? '', toColumn: 'region', cardinality: 'many-to-one', filterDirection: 'single', active: true
    });
    const measureId = crypto.randomUUID();
    expect(await manager.upsertMeasure({ id: measureId, name: 'Total sales', description: '', tableId: source?.id ?? '', expression: 'SUM("amount")', format: 'number' })).toBe('65');

    const report = manager.project?.reports[0];
    const page = report?.pages[0];
    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: crypto.randomUUID(), title: 'Sales by region', type: 'bar', tableId: source?.id ?? '', categoryField: 'region', measureId, aggregation: 'sum', columns: [], limit: 100, width: 6, height: 4
    });
    const visualData = await manager.loadPage(report?.id ?? '', page?.id ?? '');
    expect(visualData[0]?.rows).toEqual([{ category: 'South', value: '55' }, { category: 'North', value: '10' }]);

    await manager.save();
    const file = manager.projectFile ?? '';
    expect(JSON.parse(await readFile(file, 'utf8')).tables).toHaveLength(2);
    await manager.close();
    await manager.open(file);
    expect(manager.project?.measures[0]?.name).toBe('Total sales');
    expect(manager.project?.reports[0]?.pages[0]?.visuals).toHaveLength(1);
  });
});
