import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getMetadataProvider, runReportValidation } from '@microsoft/powerbi-report-authoring-cli';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectManager } from '../../src/core/projectManager.js';

describe('Power BI Desktop Project export', () => {
  let root: string;
  let manager: ProjectManager;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'bi-workbench-powerbi-'));
    manager = new ProjectManager();
  });

  afterEach(async () => {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  });

  it('exports complete table data, TMDL metadata, and Microsoft-valid PBIR visuals', async () => {
    await manager.create(path.join(root, 'retail'), 'Retail Analytics');
    const sourceFile = path.join(root, 'sales.csv');
    await writeFile(
      sourceFile,
      'region,customer,amount,sale_date\nNorth,A,10,2026-01-01\nSouth,B,25,2026-01-02\nSouth,C,30,2026-01-03\n',
      'utf8'
    );
    await manager.importFile(sourceFile, 'Sales');
    const sales = manager.project?.tables[0];
    expect(sales).toBeDefined();
    await manager.updateTablePresentation(sales?.id ?? '', {
      name: 'Sales model',
      description: 'Synthetic sales facts',
      columns: (sales?.columns ?? []).map((column) => ({
        name: column.name,
        displayName: ({ region: 'Region', customer: 'Customer', amount: 'Revenue', sale_date: 'Sale date' } as Record<string, string>)[column.name] ?? column.name,
        description: '',
        hidden: false,
        semanticType: column.name === 'amount' ? 'measure' : column.name === 'sale_date' ? 'date' : 'category',
        format: column.name === 'amount' ? 'number' : column.name === 'sale_date' ? 'date' : 'text'
      }))
    });
    await manager.createDerivedTable(sales?.id ?? '', 'Regional sales', [
      {
        id: 'group',
        label: 'Regional totals',
        type: 'group',
        groupBy: ['region'],
        aggregations: [{ column: 'amount', function: 'sum', name: 'revenue' }]
      }
    ]);
    const regional = manager.project?.tables.find((table) => table.name === 'Regional sales');
    await manager.upsertRelationship({
      id: crypto.randomUUID(),
      fromTableId: regional?.id ?? '',
      fromColumn: 'region',
      toTableId: sales?.id ?? '',
      toColumn: 'region',
      cardinality: 'one-to-many',
      filterDirection: 'both',
      active: true
    });
    const totalMeasureId = crypto.randomUUID();
    await manager.upsertMeasure({
      id: totalMeasureId,
      name: 'Total revenue',
      description: 'Total sales amount',
      tableId: sales?.id ?? '',
      expression: 'SUM("amount")',
      format: 'number'
    });

    const report = manager.project?.reports[0];
    const page = report?.pages[0];
    await manager.renameReport(report?.id ?? '', 'Executive report', 'Synthetic validation report');
    await manager.renamePage(report?.id ?? '', page?.id ?? '', 'Overview', 'Sales overview');
    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: crypto.randomUUID(), title: 'Revenue by region', type: 'bar', tableId: sales?.id ?? '', categoryField: 'region', measureId: totalMeasureId,
      aggregation: 'sum', columns: [], limit: 100, width: 7, height: 5, interactionMode: 'filter'
    });
    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: crypto.randomUUID(), title: 'Revenue total', type: 'kpi', tableId: sales?.id ?? '', measureId: totalMeasureId,
      aggregation: 'sum', columns: [], limit: 1, width: 5, height: 3, interactionMode: 'none'
    });
    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: crypto.randomUUID(), title: 'Choose a region', type: 'slicer', tableId: sales?.id ?? '', categoryField: 'region',
      aggregation: 'none', columns: [], limit: 100, width: 4, height: 4, interactionMode: 'filter'
    });
    await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
      id: crypto.randomUUID(), title: 'Sales rows', type: 'table', tableId: sales?.id ?? '',
      aggregation: 'none', columns: ['region', 'customer', 'amount'], limit: 100, width: 8, height: 5, interactionMode: 'filter'
    });
    const additionalVisuals = [
      { title: 'Horizontal revenue', type: 'horizontalBar' as const, categoryField: 'region', measureId: totalMeasureId },
      { title: 'Revenue trend', type: 'line' as const, categoryField: 'sale_date', measureId: totalMeasureId },
      { title: 'Revenue area', type: 'area' as const, categoryField: 'sale_date', measureId: totalMeasureId },
      { title: 'Revenue share', type: 'pie' as const, categoryField: 'region', measureId: totalMeasureId },
      { title: 'Revenue donut', type: 'donut' as const, categoryField: 'region', measureId: totalMeasureId },
      { title: 'Revenue scatter', type: 'scatter' as const, categoryField: 'amount', valueField: 'amount' }
    ];
    for (const visual of additionalVisuals) {
      await manager.upsertVisual(report?.id ?? '', page?.id ?? '', {
        id: crypto.randomUUID(),
        title: visual.title,
        type: visual.type,
        tableId: sales?.id ?? '',
        categoryField: visual.categoryField,
        ...(visual.measureId ? { measureId: visual.measureId } : {}),
        ...(visual.valueField ? { valueField: visual.valueField } : {}),
        aggregation: 'sum',
        columns: [],
        limit: 100,
        width: 6,
        height: 4,
        interactionMode: 'filter'
      });
    }

    const target = process.env.BI_WORKBENCH_POWERBI_FIXTURE
      ? path.resolve(process.env.BI_WORKBENCH_POWERBI_FIXTURE)
      : path.join(root, 'Retail-PowerBI');
    const result = await manager.exportPowerBiProject(target);
    expect(result.counts).toMatchObject({
      tables: 2,
      rows: 5,
      measures: 1,
      relationships: 1,
      reports: 1,
      pages: 1,
      visuals: 10
    });
    expect(result.warnings).toEqual([]);

    const pbip = JSON.parse(await readFile(result.pbipFile, 'utf8')) as {
      artifacts: { report: { path: string } }[];
    };
    expect(pbip.artifacts).toHaveLength(1);
    const reportDirectory = path.join(target, pbip.artifacts[0]?.report.path ?? '');
    const provider = await getMetadataProvider();
    const validation = await runReportValidation({
      reportDir: reportDirectory,
      defDir: path.join(reportDirectory, 'definition'),
      provider,
      skipSchema: false
    });
    expect(validation.errorCount, JSON.stringify(validation.diagnostics, null, 2)).toBe(0);

    const semanticModelFile = result.files.find((file) => file.endsWith('.SemanticModel/definition.pbism'));
    expect(semanticModelFile).toBeDefined();
    const semanticDirectory = path.join(path.dirname(path.join(target, semanticModelFile ?? '')), 'definition');
    const tableFiles = result.files.filter((file) => file.includes('.SemanticModel/definition/tables/') && file.endsWith('.tmdl'));
    expect(tableFiles).toHaveLength(2);
    const tableDefinitions = await Promise.all(tableFiles.map(async (file) => ({
      file,
      content: await readFile(path.join(target, file), 'utf8')
    })));
    const salesTmdl = tableDefinitions.find((definition) => definition.content.includes("table 'Sales model'"))?.content ?? '';
    expect(salesTmdl).toContain("measure 'Total revenue' = SUM('Sales model'[Revenue])");
    expect(salesTmdl).toContain('\t/// Total sales amount');
    expect(salesTmdl).not.toContain('description:');
    expect(salesTmdl).toContain('Table.TransformColumnTypes');
    expect(salesTmdl).toContain(path.join(target, 'Data').replaceAll('"', '""'));
    const relationships = await readFile(path.join(semanticDirectory, 'relationships.tmdl'), 'utf8');
    expect(relationships).toContain('fromCardinality: many');
    expect(relationships).toContain('toCardinality: one');
    expect(relationships).toContain("fromColumn: 'Sales model'.Region");
    expect(relationships).toContain("toColumn: 'Regional sales'.region");
    expect(relationships).toContain('crossFilteringBehavior: bothDirections');

    const exportedCsvFiles = result.files.filter((file) => file.startsWith('Data/') && file.endsWith('.csv'));
    expect(exportedCsvFiles).toHaveLength(2);
    const exportedCsv = await Promise.all(exportedCsvFiles.map(async (file) => ({
      file,
      content: await readFile(path.join(target, file), 'utf8')
    })));
    const salesCsv = exportedCsv.find((candidate) => candidate.content.startsWith('"Region","Customer","Revenue","Sale date"'))?.content ?? '';
    expect(salesCsv.trim().split(/\r?\n/)).toHaveLength(4);
    expect(salesCsv).toContain('"South","C","30"');

    const pageFile = result.files.find((file) => file.endsWith('/page.json'));
    const pageJson = JSON.parse(await readFile(path.join(target, pageFile ?? ''), 'utf8')) as { displayOption?: string };
    expect(pageJson.displayOption).toBe('FitToWidth');
    expect(Math.max(...result.files.map((file) => path.join(target, file).length))).toBeLessThanOrEqual(240);

    await expect(manager.exportPowerBiProject(target)).rejects.toThrow('target already exists');
    await expect(manager.exportPowerBiProject(path.join(root, 'x'.repeat(160)))).rejects.toThrow('destination is too deep');
  }, 60_000);
});
