import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DuckDbEngine } from '../../src/core/duckdbEngine.js';

describe('DuckDbEngine', () => {
  let directory: string;
  let engine: DuckDbEngine;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'bi-workbench-engine-'));
    engine = new DuckDbEngine();
    await engine.open(path.join(directory, 'data.duckdb'));
  });

  afterEach(async () => {
    await engine.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('persists tables and returns bounded JSON-safe results', async () => {
    await engine.runInternal("CREATE TABLE sales(region VARCHAR, amount BIGINT); INSERT INTO sales VALUES ('North', 10), ('South', 20), ('West', 30)");
    const result = await engine.queryReadOnly('SELECT region, amount FROM sales ORDER BY amount DESC', 2);
    expect(result.rows).toEqual([{ region: 'West', amount: '30' }, { region: 'South', amount: '20' }]);
    expect(result.truncated).toBe(true);
    expect(await engine.tableRowCount('sales')).toBe(3);
    expect((await engine.describeTable('sales')).map((column) => column.name)).toEqual(['region', 'amount']);
  });

  it('rejects mutating and arbitrary-file queries', async () => {
    await expect(engine.queryReadOnly('CREATE TABLE bad(i INTEGER)', 10)).rejects.toThrow('Only SELECT');
    await expect(engine.queryReadOnly("SELECT * FROM read_csv('C:/secret.csv')", 10)).rejects.toThrow('not allowed');
  });

  it('waits for an interrupted timeout before reusing the connection', async () => {
    await expect(engine.queryReadOnly('SELECT SUM(i) FROM range(1000000000) AS generated(i)', 1, 1))
      .rejects.toThrow('Query exceeded');
    const recovered = await engine.queryReadOnly('SELECT 42 AS answer', 1);
    expect(recovered.rows).toEqual([{ answer: 42 }]);
  });
});
