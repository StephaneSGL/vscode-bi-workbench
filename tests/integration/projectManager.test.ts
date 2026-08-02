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
    await writeFile(csv, 'region,product,amount,sale_date\nNorth,A,10,2025-12-01\nSouth,A,25,2026-01-02\nSouth,B,30,2026-02-03\n', 'utf8');
    await manager.importFile(csv);
    const source = manager.project?.tables[0];
    expect(source?.rowCount).toBe(3);

    await manager.updateTablePresentation(source?.id ?? '', {
      name: 'Sales model',
      description: 'Validated sales facts',
      columns: (source?.columns ?? []).map((column) => ({
        name: column.name,
        displayName: ({ region: 'Sales region', product: 'Product', amount: 'Revenue', sale_date: 'Sale date' } as Record<string, string>)[column.name] ?? column.name,
        description: '',
        hidden: column.name === 'product',
        semanticType: column.name === 'amount' ? 'measure' : column.name === 'sale_date' ? 'date' : 'category',
        format: column.name === 'amount' ? 'currency' : column.name === 'sale_date' ? 'date' : 'text'
      }))
    });
    expect(manager.project?.tables[0]?.columns.find((column) => column.name === 'amount')?.displayName).toBe('Revenue');

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
    await manager.renameReport(report?.id ?? '', 'Executive sales', 'Decision dashboard');
    await manager.renamePage(report?.id ?? '', page?.id ?? '', 'Overview', 'Regional overview');
    await manager.updateTheme({ name: 'Ocean', primaryColor: '#2266aa', backgroundColor: '#101820', palette: ['#2266aa', '#22aa88'] });
    const visualId = crypto.randomUUID();
    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: visualId, title: 'Sales by region and product', description: 'Grouped regional revenue', type: 'bar', tableId: source?.id ?? '', categoryField: 'region', seriesField: 'product', measureId, aggregation: 'sum', columns: [], limit: 100, width: 8, height: 5, sortBy: 'value', sortDirection: 'desc', color: '#2266aa', showLegend: true, legendPosition: 'right', showLabels: true, smooth: false, numberFormat: 'currency', currency: 'EUR', decimals: 0, interactionMode: 'filter'
    });
    const visualData = await manager.loadPage(report?.id ?? '', page?.id ?? '');
    expect(visualData[0]?.rows).toEqual([
      { category: 'South', series: 'B', value: '30' },
      { category: 'South', series: 'A', value: '25' },
      { category: 'North', series: 'A', value: '10' }
    ]);
    const sortedId = crypto.randomUUID();
    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: sortedId, title: 'Sorted sales', type: 'bar', tableId: source?.id ?? '', categoryField: 'region', valueField: 'amount', aggregation: 'sum', columns: [], limit: 100, width: 6, height: 4, sortField: 'product', sortDirection: 'desc'
    });
    const sortedData = await manager.loadPage(report?.id ?? '', page?.id ?? '');
    expect(sortedData.find((item) => item.visualId === sortedId)?.rows).toEqual([
      { category: 'South', value: '55', __sort: 'B' },
      { category: 'North', value: '10', __sort: 'A' }
    ]);
    await manager.deleteVisual(report?.id ?? '', page?.id ?? '', sortedId);
    await expect(manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: crypto.randomUUID(), title: 'Invalid split pie', type: 'pie', tableId: source?.id ?? '', categoryField: 'region', seriesField: 'product', valueField: 'amount', aggregation: 'sum', columns: [], limit: 100, width: 6, height: 4
    })).rejects.toThrow(/do not support a series field/);
    const duplicateId = await manager.duplicateVisual(report?.id ?? '', page?.id ?? '', visualId);
    await manager.reorderVisual(report?.id ?? '', page?.id ?? '', duplicateId, 0);
    expect(manager.project?.reports[0]?.pages[0]?.visuals[0]?.id).toBe(duplicateId);

    await manager.createDerivedTable(source?.id ?? '', 'Annual sales', [
      { id: 'replace', label: 'Expand product name', type: 'replace', column: 'product', find: 'A', replacement: 'Alpha', mode: 'exact' },
      { id: 'year', label: 'Extract year', type: 'datePart', column: 'sale_date', part: 'year', newName: 'sale_year' },
      { id: 'group', label: 'Annual totals', type: 'group', groupBy: ['region', 'sale_year'], aggregations: [
        { column: 'amount', function: 'sum', name: 'revenue' },
        { column: 'product', function: 'count', name: 'rows' }
      ] },
      { id: 'sort-annual', label: 'Sort regions', type: 'sort', column: 'region', direction: 'asc' }
    ]);
    const annual = manager.project?.tables.find((table) => table.name === 'Annual sales');
    expect(annual?.rowCount).toBe(2);
    expect((await manager.previewTable(annual?.id ?? '', 10)).rows).toEqual([
      { region: 'North', sale_year: '2025', revenue: '10', rows: '1' },
      { region: 'South', sale_year: '2026', revenue: '55', rows: '2' }
    ]);

    await manager.save();
    const file = manager.projectFile ?? '';
    expect(JSON.parse(await readFile(file, 'utf8')).tables).toHaveLength(3);
    await manager.close();
    await manager.open(file);
    expect(manager.project?.measures[0]?.name).toBe('Total sales');
    expect(manager.project?.reports[0]?.name).toBe('Executive sales');
    expect(manager.project?.reports[0]?.pages[0]?.name).toBe('Overview');
    expect(manager.project?.reports[0]?.pages[0]?.visuals).toHaveLength(2);
    expect(manager.project?.theme.name).toBe('Ocean');
  });
});
