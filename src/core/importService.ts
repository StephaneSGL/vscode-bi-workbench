import { stat, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import type { BiProject, DataSource, SourceKind, TableModel } from '../shared/project.js';
import type { DuckDbEngine, DuckDbTransaction } from './duckdbEngine.js';
import { escapeSqlString, quoteIdentifier, uniquePhysicalName } from './sql.js';

export interface ImportOptions {
  filePath: string;
  targetName?: string;
  projectDirectory: string;
}

export interface ImportResult {
  source: DataSource;
  tables: TableModel[];
}

export class ImportService {
  constructor(private readonly engine: DuckDbEngine) {}

  async importFile(project: BiProject, options: ImportOptions): Promise<ImportResult> {
    const absolutePath = path.resolve(options.filePath);
    const sourceStat = await stat(absolutePath);
    if (!sourceStat.isFile()) {
      throw new Error(`Import source is not a file: ${absolutePath}`);
    }

    const kind = this.detectKind(absolutePath);
    const source: DataSource = {
      id: crypto.randomUUID(),
      kind,
      name: path.basename(absolutePath),
      location: this.relativeLocation(options.projectDirectory, absolutePath),
      importedAt: new Date().toISOString()
    };
    const existingNames = new Set(project.tables.map((table) => table.physicalName));
    let importedPhysicalNames: { physicalName: string; displayName: string }[];

    if (kind === 'xlsx') {
      importedPhysicalNames = await this.importWorkbook(absolutePath, options.targetName, existingNames);
    } else if (kind === 'duckdb') {
      importedPhysicalNames = await this.importDuckDb(absolutePath, options.targetName, existingNames);
    } else {
      const displayName = options.targetName?.trim() || path.basename(absolutePath, path.extname(absolutePath));
      const physicalName = uniquePhysicalName(displayName, existingNames);
      await this.importSingleFile(kind, absolutePath, physicalName);
      importedPhysicalNames = [{ physicalName, displayName }];
    }

    const tables: TableModel[] = [];
    for (const imported of importedPhysicalNames) {
      const columns = await this.engine.describeTable(imported.physicalName);
      const rowCount = await this.engine.tableRowCount(imported.physicalName);
      tables.push({
        id: crypto.randomUUID(),
        name: imported.displayName,
        physicalName: imported.physicalName,
        kind: 'imported',
        sourceId: source.id,
        columns,
        rowCount,
        transformations: []
      });
    }

    return { source, tables };
  }

  private detectKind(filePath: string): SourceKind {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.csv':
        return 'csv';
      case '.tsv':
        return 'tsv';
      case '.json':
        return 'json';
      case '.jsonl':
      case '.ndjson':
        return 'jsonl';
      case '.parquet':
        return 'parquet';
      case '.xlsx':
        return 'xlsx';
      case '.duckdb':
      case '.db':
        return 'duckdb';
      default:
        throw new Error(`Unsupported import format: ${extension || '(none)'}.`);
    }
  }

  private async importSingleFile(kind: Exclude<SourceKind, 'xlsx' | 'duckdb'>, filePath: string, tableName: string): Promise<void> {
    const target = quoteIdentifier(tableName);
    const statements: Record<Exclude<SourceKind, 'xlsx' | 'duckdb'>, string> = {
      csv: `CREATE TABLE ${target} AS SELECT * FROM read_csv(?, header = true, sample_size = -1, strict_mode = true)`,
      tsv: `CREATE TABLE ${target} AS SELECT * FROM read_csv(?, header = true, delim = '\t', sample_size = -1, strict_mode = true)`,
      json: `CREATE TABLE ${target} AS SELECT * FROM read_json_auto(?, union_by_name = true)`,
      jsonl: `CREATE TABLE ${target} AS SELECT * FROM read_json_auto(?, format = 'newline_delimited', union_by_name = true)`,
      parquet: `CREATE TABLE ${target} AS SELECT * FROM read_parquet(?, union_by_name = true)`
    };

    await this.engine.transaction(async (transaction) => {
      await transaction.run(statements[kind], [filePath]);
    });
  }

  private async importWorkbook(
    filePath: string,
    requestedName: string | undefined,
    existingNames: Set<string>
  ): Promise<{ physicalName: string; displayName: string }[]> {
    const sheets = await readXlsxFile(filePath);
    if (sheets.length === 0) {
      throw new Error('The XLSX workbook contains no worksheets.');
    }
    const databasePath = this.engine.path;
    if (!databasePath) {
      throw new Error('No BI project database is open.');
    }
    const tempFiles: string[] = [];
    const definitions: {
      physicalName: string;
      displayName: string;
      columns: string[];
      tempFile?: string;
    }[] = [];

    try {
      for (const [sheetIndex, sheet] of sheets.entries()) {
        if (sheet.data.length === 0) {
          continue;
        }
        const displayName = requestedName
          ? sheets.length === 1
            ? requestedName
            : `${requestedName} - ${sheet.sheet}`
          : sheet.sheet || `Sheet ${sheetIndex + 1}`;
        const physicalName = uniquePhysicalName(displayName, existingNames);
        existingNames.add(physicalName);
        const width = Math.max(...sheet.data.map((row) => row.length));
        const firstRow = sheet.data[0] ?? [];
        const columns = this.uniqueColumnNames(
          Array.from({ length: width }, (_unused, columnIndex) => {
            const header = firstRow[columnIndex];
            return header === null || header === undefined || String(header).trim() === ''
              ? `column_${columnIndex + 1}`
              : String(header).trim();
          })
        );
        const dataRows = sheet.data.slice(1);
        if (dataRows.length === 0) {
          definitions.push({ physicalName, displayName, columns });
          continue;
        }

        const tempFile = path.join(path.dirname(databasePath), `xlsx-${crypto.randomUUID()}.jsonl`);
        const lines = dataRows.map((row) => {
          const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
          columns.forEach((column, columnIndex) => {
            const value = row[columnIndex] ?? null;
            record[column] = value instanceof Date ? value.toISOString() : value;
          });
          return JSON.stringify(record);
        });
        await writeFile(tempFile, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
        tempFiles.push(tempFile);
        definitions.push({ physicalName, displayName, columns, tempFile });
      }

      if (definitions.length === 0) {
        throw new Error('The XLSX workbook contains no non-empty worksheets.');
      }

      await this.engine.transaction(async (transaction) => {
        for (const definition of definitions) {
          if (definition.tempFile) {
            await transaction.run(
              `CREATE TABLE ${quoteIdentifier(definition.physicalName)} AS SELECT * FROM read_json_auto(?, format = 'newline_delimited', union_by_name = true)`,
              [definition.tempFile]
            );
          } else {
            const columnsSql = definition.columns.map((column) => `${quoteIdentifier(column)} VARCHAR`).join(', ');
            await transaction.run(`CREATE TABLE ${quoteIdentifier(definition.physicalName)} (${columnsSql})`);
          }
        }
      });
      return definitions.map(({ physicalName, displayName }) => ({ physicalName, displayName }));
    } finally {
      await Promise.all(tempFiles.map(async (tempFile) => rm(tempFile, { force: true })));
    }
  }

  private async importDuckDb(
    filePath: string,
    requestedName: string | undefined,
    existingNames: Set<string>
  ): Promise<{ physicalName: string; displayName: string }[]> {
    if (path.resolve(filePath).toLowerCase() === path.resolve(this.engine.path ?? '').toLowerCase()) {
      throw new Error('The active project database cannot be imported into itself.');
    }
    const alias = `source_${crypto.randomUUID().replaceAll('-', '')}`;
    return this.engine.exclusive(async (transaction) => {
      await transaction.run(`ATTACH '${escapeSqlString(filePath)}' AS ${quoteIdentifier(alias)} (READ_ONLY)`);
      try {
        const tablesResult = await transaction.query(
          "SELECT table_name FROM duckdb_tables() WHERE database_name = ? AND schema_name = 'main' AND internal = false ORDER BY table_name",
          [alias]
        );
        if (tablesResult.rows.length === 0) {
          throw new Error('The DuckDB source contains no base tables.');
        }
        await transaction.run('BEGIN TRANSACTION');
        try {
          const imported: { physicalName: string; displayName: string }[] = [];
          for (const row of tablesResult.rows) {
            const sourceTable = String(row.table_name);
            const displayName = requestedName
              ? tablesResult.rows.length === 1
                ? requestedName
                : `${requestedName} - ${sourceTable}`
              : sourceTable;
            const physicalName = uniquePhysicalName(displayName, existingNames);
            existingNames.add(physicalName);
            await transaction.run(
              `CREATE TABLE ${quoteIdentifier(physicalName)} AS SELECT * FROM ${quoteIdentifier(alias)}.main.${quoteIdentifier(sourceTable)}`
            );
            imported.push({ physicalName, displayName });
          }
          await transaction.run('COMMIT');
          return imported;
        } catch (error) {
          try {
            await transaction.run('ROLLBACK');
          } catch {
            // Preserve the import error if DuckDB already aborted the transaction.
          }
          throw error;
        }
      } finally {
        await transaction.run(`DETACH ${quoteIdentifier(alias)}`);
      }
    });
  }

  private uniqueColumnNames(headers: readonly string[]): string[] {
    const used = new Set<string>();
    return headers.map((header, index) => {
      const base = header.trim() || `column_${index + 1}`;
      let candidate = base;
      let suffix = 2;
      while (used.has(candidate.toLowerCase())) {
        candidate = `${base}_${suffix}`;
        suffix += 1;
      }
      used.add(candidate.toLowerCase());
      return candidate;
    });
  }

  private relativeLocation(projectDirectory: string, sourcePath: string): string {
    const relative = path.relative(projectDirectory, sourcePath);
    return !relative.startsWith('..') && !path.isAbsolute(relative)
      ? relative.replaceAll(path.sep, '/')
      : sourcePath;
  }
}

export async function detachIfPresent(transaction: DuckDbTransaction, alias: string): Promise<void> {
  await transaction.run(`DETACH ${quoteIdentifier(alias)}`);
}
