import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type { Column, ColumnProfile, QueryResult } from '../shared/project.js';
import { assertReadOnlyQuery, quoteIdentifier, type SqlParameter } from './sql.js';

export interface DuckDbTransaction {
  run(sql: string, values?: readonly SqlParameter[]): Promise<void>;
  query(sql: string, values?: readonly SqlParameter[], limit?: number): Promise<QueryResult>;
}

export class DuckDbEngine {
  private instance?: DuckDBInstance;
  private connection?: DuckDBConnection;
  private databasePath?: string;
  private queue: Promise<void> = Promise.resolve();

  get path(): string | undefined {
    return this.databasePath;
  }

  async open(databasePath: string): Promise<void> {
    await this.close();
    await mkdir(path.dirname(databasePath), { recursive: true });
    this.instance = await DuckDBInstance.create(databasePath, {
      threads: String(Math.max(1, Math.min(4, Number(process.env.NUMBER_OF_PROCESSORS ?? 2))))
    });
    this.connection = await this.instance.connect();
    this.databasePath = databasePath;
    await this.runInternal("SET enable_progress_bar = false");
  }

  async close(): Promise<void> {
    await this.queue.catch(() => undefined);
    this.connection?.closeSync();
    this.instance?.closeSync();
    this.connection = undefined;
    this.instance = undefined;
    this.databasePath = undefined;
    this.queue = Promise.resolve();
  }

  interrupt(): void {
    this.connection?.interrupt();
  }

  async version(): Promise<string> {
    const result = await this.queryInternal('SELECT version() AS version', [], 1);
    return String(result.rows[0]?.version ?? 'unknown');
  }

  async queryReadOnly(sql: string, limit: number, timeoutMs = 30_000): Promise<QueryResult> {
    const safeSql = assertReadOnlyQuery(sql);
    const boundedSql = `SELECT * FROM (${safeSql}) AS ${quoteIdentifier('__bi_result')} LIMIT ${Math.max(1, limit) + 1}`;
    const started = performance.now();
    const result = await this.enqueue(async (connection) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        const queryPromise = connection.runAndReadAll(boundedSql);
        timer = setTimeout(() => {
          timedOut = true;
          connection.interrupt();
        }, timeoutMs);
        const reader = await queryPromise;
        if (timedOut) {
          throw new Error(`Query exceeded the ${Math.round(timeoutMs / 1000)} second timeout.`);
        }
        return this.readerToResult(reader, limit, performance.now() - started);
      } catch (error) {
        if (timedOut) {
          throw new Error(`Query exceeded the ${Math.round(timeoutMs / 1000)} second timeout.`, { cause: error });
        }
        throw error;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    });
    return result;
  }

  async queryInternal(sql: string, values: readonly SqlParameter[] = [], limit?: number): Promise<QueryResult> {
    const started = performance.now();
    return this.enqueue(async (connection) => {
      const reader = await connection.runAndReadAll(sql, [...values]);
      return this.readerToResult(reader, limit, performance.now() - started);
    });
  }

  async runInternal(sql: string, values: readonly SqlParameter[] = []): Promise<void> {
    await this.enqueue(async (connection) => {
      await connection.run(sql, [...values]);
    });
  }

  async transaction<T>(operation: (transaction: DuckDbTransaction) => Promise<T>): Promise<T> {
    return this.enqueue(async (connection) => {
      await connection.run('BEGIN TRANSACTION');
      const transaction = this.executor(connection);
      try {
        const result = await operation(transaction);
        await connection.run('COMMIT');
        return result;
      } catch (error) {
        try {
          await connection.run('ROLLBACK');
        } catch {
          // Preserve the original failure; DuckDB may already have aborted the transaction.
        }
        throw error;
      }
    });
  }

  async exclusive<T>(operation: (executor: DuckDbTransaction) => Promise<T>): Promise<T> {
    return this.enqueue(async (connection) => operation(this.executor(connection)));
  }

  private executor(connection: DuckDBConnection): DuckDbTransaction {
    return {
      run: async (sql, values = []) => {
        await connection.run(sql, [...values]);
      },
      query: async (sql, values = [], limit) => {
        const started = performance.now();
        const reader = await connection.runAndReadAll(sql, [...values]);
        return this.readerToResult(reader, limit, performance.now() - started);
      }
    };
  }

  async describeTable(tableName: string): Promise<Column[]> {
    const result = await this.queryInternal(`DESCRIBE ${quoteIdentifier(tableName)}`);
    return result.rows.map((row) => ({
      name: String(row.column_name),
      dataType: String(row.column_type),
      nullable: String(row.null).toUpperCase() !== 'NO'
    }));
  }

  async tableRowCount(tableName: string): Promise<number> {
    const result = await this.queryInternal(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`, [], 1);
    return Number(result.rows[0]?.count ?? 0);
  }

  async profileTable(tableName: string, columns: readonly Column[]): Promise<ColumnProfile[]> {
    const profiles: ColumnProfile[] = [];
    for (const column of columns) {
      const field = quoteIdentifier(column.name);
      const result = await this.queryInternal(
        `SELECT
           COUNT(*) - COUNT(${field}) AS null_count,
           COUNT(DISTINCT ${field}) AS distinct_count,
           MIN(CAST(${field} AS VARCHAR)) AS minimum,
           MAX(CAST(${field} AS VARCHAR)) AS maximum,
           AVG(TRY_CAST(${field} AS DOUBLE)) AS average
         FROM ${quoteIdentifier(tableName)}`,
        [],
        1
      );
      const row = result.rows[0] ?? {};
      const average = row.average === null || row.average === undefined ? undefined : Number(row.average);
      profiles.push({
        column,
        nullCount: Number(row.null_count ?? 0),
        distinctCount: Number(row.distinct_count ?? 0),
        ...(row.minimum === null || row.minimum === undefined ? {} : { minimum: row.minimum }),
        ...(row.maximum === null || row.maximum === undefined ? {} : { maximum: row.maximum }),
        ...(average === undefined || Number.isNaN(average) ? {} : { average })
      });
    }
    return profiles;
  }

  private requireConnection(): DuckDBConnection {
    if (!this.connection) {
      throw new Error('No BI project database is open.');
    }
    return this.connection;
  }

  private async enqueue<T>(operation: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: (() => void) | undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => undefined);
    try {
      return await operation(this.requireConnection());
    } finally {
      release?.();
    }
  }

  private readerToResult(
    reader: Awaited<ReturnType<DuckDBConnection['runAndReadAll']>>,
    limit: number | undefined,
    durationMs: number
  ): QueryResult {
    const names = reader.deduplicatedColumnNames();
    const types = reader.columnTypes().map((type) => type.toString());
    const allRows = reader.getRowObjectsJson() as Record<string, unknown>[];
    const truncated = limit !== undefined && allRows.length > limit;
    const rows = limit === undefined ? allRows : allRows.slice(0, limit);
    return {
      columns: names.map((name, index) => ({
        name,
        dataType: types[index] ?? 'UNKNOWN',
        nullable: true
      })),
      rows,
      rowCount: rows.length,
      truncated,
      durationMs: Math.round(durationMs * 100) / 100
    };
  }
}
