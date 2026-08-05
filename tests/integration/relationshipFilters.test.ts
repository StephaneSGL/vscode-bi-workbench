import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectManager } from '../../src/core/projectManager.js';

describe('relationship-aware report filters', () => {
  let root: string;
  let manager: ProjectManager;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'bi-workbench-relations-'));
    manager = new ProjectManager();
    await manager.create(path.join(root, 'project'), 'Relationship model');
  });

  afterEach(async () => {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  });

  it('propagates dimension filters to facts and enforces single/both direction', async () => {
    const salesFile = path.join(root, 'sales.csv');
    const productsFile = path.join(root, 'products.csv');
    const categoriesFile = path.join(root, 'categories.csv');
    await writeFile(salesFile, 'product_id,amount\n1,10\n1,5\n2,20\n3,30\n', 'utf8');
    await writeFile(productsFile, 'product_id,category\n1,A\n2,B\n3,A\n', 'utf8');
    await writeFile(categoriesFile, 'category,label\nA,Group A\nB,Group B\n', 'utf8');
    await manager.importFile(salesFile);
    await manager.importFile(productsFile);
    await manager.importFile(categoriesFile);
    const sales = manager.project?.tables.find((table) => table.name === 'sales');
    const products = manager.project?.tables.find((table) => table.name === 'products');
    const categories = manager.project?.tables.find((table) => table.name === 'categories');
    const relationshipId = crypto.randomUUID();
    await manager.upsertRelationship({
      id: relationshipId,
      fromTableId: sales?.id ?? '',
      fromColumn: 'product_id',
      toTableId: products?.id ?? '',
      toColumn: 'product_id',
      cardinality: 'many-to-one',
      filterDirection: 'single',
      active: true
    });
    await manager.upsertRelationship({
      id: crypto.randomUUID(),
      fromTableId: products?.id ?? '',
      fromColumn: 'category',
      toTableId: categories?.id ?? '',
      toColumn: 'category',
      cardinality: 'many-to-one',
      filterDirection: 'single',
      active: true
    });
    const measureId = crypto.randomUUID();
    await manager.upsertMeasure({ id: measureId, name: 'Revenue', description: '', tableId: sales?.id ?? '', expression: 'SUM("amount")', format: 'number' });
    const report = manager.project?.reports[0];
    const page = report?.pages[0];
    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: 'revenue', title: 'Revenue', type: 'kpi', tableId: sales?.id ?? '', measureId, aggregation: 'sum', columns: [], limit: 100, width: 4, height: 3
    });
    await manager.upsertFilter(report?.id ?? '', page?.id ?? '', {
      id: 'category-a', tableId: categories?.id ?? '', column: 'label', operator: 'eq', value: 'Group A', temporary: false
    });
    let data = await manager.loadPage(report?.id ?? '', page?.id ?? '');
    expect(data.find((item) => item.visualId === 'revenue')?.rows).toEqual([{ value: '45' }]);

    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: 'products', title: 'Products', type: 'table', tableId: products?.id ?? '', aggregation: 'none', columns: ['product_id', 'category'], limit: 100, width: 6, height: 4
    });
    await manager.upsertFilter(report?.id ?? '', page?.id ?? '', {
      id: 'large-sale', tableId: sales?.id ?? '', column: 'amount', operator: 'gt', value: 15, temporary: false
    });
    data = await manager.loadPage(report?.id ?? '', page?.id ?? '');
    expect(data.find((item) => item.visualId === 'products')?.rows).toEqual([
      { product_id: '1', category: 'A' },
      { product_id: '3', category: 'A' }
    ]);

    await manager.upsertRelationship({
      id: relationshipId,
      fromTableId: sales?.id ?? '',
      fromColumn: 'product_id',
      toTableId: products?.id ?? '',
      toColumn: 'product_id',
      cardinality: 'many-to-one',
      filterDirection: 'both',
      active: true
    });
    data = await manager.loadPage(report?.id ?? '', page?.id ?? '');
    expect(data.find((item) => item.visualId === 'products')?.rows).toEqual([{ product_id: '3', category: 'A' }]);
  });
});
