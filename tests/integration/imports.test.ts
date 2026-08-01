import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DuckDbEngine } from '../../src/core/duckdbEngine.js';
import { ImportService } from '../../src/core/importService.js';
import { escapeSqlString } from '../../src/core/sql.js';
import { createEmptyProject } from '../../src/shared/project.js';

describe('ImportService', () => {
  let directory: string;
  let engine: DuckDbEngine;
  let service: ImportService;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'bi-workbench-import-'));
    engine = new DuckDbEngine();
    await engine.open(path.join(directory, '.bi-workbench', 'data.duckdb'));
    service = new ImportService(engine);
  });

  afterEach(async () => {
    await engine.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('imports CSV, JSONL, Parquet, and XLSX as real DuckDB tables', async () => {
    const project = createEmptyProject('Imports');
    const csv = path.join(directory, 'sales.csv');
    const jsonl = path.join(directory, 'customers.jsonl');
    const parquet = path.join(directory, 'events.parquet');
    const xlsx = path.join(directory, 'budget.xlsx');
    await writeFile(csv, 'region,amount\nNorth,10\nSouth,25\n', 'utf8');
    await writeFile(jsonl, '{"customer":"A","active":true}\n{"customer":"B","active":false}\n', 'utf8');
    await engine.runInternal(`COPY (SELECT 1 AS id, 'open' AS status UNION ALL SELECT 2, 'closed') TO '${escapeSqlString(parquet)}' (FORMAT PARQUET)`);
    await writeFile(xlsx, minimalXlsx(), { mode: 0o600 });

    const csvResult = await service.importFile(project, { filePath: csv, projectDirectory: directory });
    project.sources.push(csvResult.source); project.tables.push(...csvResult.tables);
    const jsonResult = await service.importFile(project, { filePath: jsonl, projectDirectory: directory });
    project.sources.push(jsonResult.source); project.tables.push(...jsonResult.tables);
    const parquetResult = await service.importFile(project, { filePath: parquet, projectDirectory: directory });
    project.sources.push(parquetResult.source); project.tables.push(...parquetResult.tables);
    const excelResult = await service.importFile(project, { filePath: xlsx, projectDirectory: directory });

    expect(csvResult.tables[0]?.rowCount).toBe(2);
    expect(jsonResult.tables[0]?.columns.map((column) => column.name)).toEqual(['customer', 'active']);
    expect(parquetResult.tables[0]?.rowCount).toBe(2);
    expect(excelResult.tables).toHaveLength(1);
    expect(excelResult.tables[0]?.columns.map((column) => column.name)).toEqual(['department', 'budget']);
    expect(excelResult.tables[0]?.rowCount).toBe(2);
  });

  it('copies every base table from a DuckDB source', async () => {
    const sourcePath = path.join(directory, 'source.duckdb');
    const sourceEngine = new DuckDbEngine();
    await sourceEngine.open(sourcePath);
    await sourceEngine.runInternal('CREATE TABLE alpha AS SELECT 1 AS id; CREATE TABLE beta AS SELECT 2 AS id');
    await sourceEngine.close();

    const project = createEmptyProject('Database import');
    const result = await service.importFile(project, { filePath: sourcePath, projectDirectory: directory });
    expect(result.tables.map((table) => table.name)).toEqual(['alpha', 'beta']);
    expect(result.tables.every((table) => table.rowCount === 1)).toBe(true);
  });
});

function minimalXlsx(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>department</t></is></c><c r="B1" t="inlineStr"><is><t>budget</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>IT</t></is></c><c r="B2"><v>1200</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Sales</t></is></c><c r="B3"><v>900</v></c></row></sheetData></worksheet>')
  };
  return zipSync(files, { level: 6 });
}
