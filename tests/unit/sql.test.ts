import { describe, expect, it } from 'vitest';
import {
  assertAggregateOnlyQuery,
  assertReadOnlyQuery,
  assertSafeMeasureExpression,
  compileFilterPredicate,
  compileTransformationPipeline,
  normalizePhysicalName,
  quoteIdentifier,
  uniquePhysicalName
} from '../../src/core/sql.js';

describe('SQL safety', () => {
  it('accepts a single SELECT or CTE and trims its terminal semicolon', () => {
    expect(assertReadOnlyQuery(' SELECT * FROM "sales"; ')).toBe('SELECT * FROM "sales"');
    expect(assertReadOnlyQuery('WITH totals AS (SELECT 1 AS value) SELECT * FROM totals')).toContain('WITH totals');
  });

  it.each([
    'DELETE FROM sales',
    'SELECT 1; DROP TABLE sales',
    "SELECT * FROM read_csv('secret.csv')",
    "SELECT * FROM \"read_csv\"('secret.csv')",
    "SELECT * FROM parquet_scan('secret.parquet')",
    "SELECT getenv('USERPROFILE')",
    "SELECT http_post('https://example.invalid', 'secret')",
    'SELECT * FROM duckdb_databases()',
    "SELECT * FROM 'secret.parquet'",
    'WITH changed AS (UPDATE sales SET amount = 0 RETURNING *) SELECT * FROM changed',
    'SELECT * FROM query_table(\'sales\')'
  ])('rejects unsafe query: %s', (sql) => {
    expect(() => assertReadOnlyQuery(sql)).toThrow();
  });

  it('does not mistake keywords inside literals or comments for statements', () => {
    expect(assertReadOnlyQuery("SELECT 'drop table', 1 -- delete\nFROM \"safe\""))
      .toContain("'drop table'");
  });

  it('validates scalar measure expressions', () => {
    expect(assertSafeMeasureExpression('SUM("amount") FILTER (WHERE "active")')).toContain('SUM');
    expect(() => assertSafeMeasureExpression('(SELECT SUM(amount) FROM sales)')).toThrow();
    expect(() => assertSafeMeasureExpression("http_post('https://example.invalid', MAX(amount))")).toThrow();
  });

  it('allows bounded aggregate shapes and rejects raw-row aggregate bypasses', () => {
    expect(assertAggregateOnlyQuery('SELECT region, SUM(amount) AS revenue FROM sales GROUP BY region'))
      .toContain('SUM');
    expect(assertAggregateOnlyQuery('SELECT ROUND(AVG(amount), 2) AS average FROM sales'))
      .toContain('ROUND');
    expect(() => assertAggregateOnlyQuery('SELECT email, COUNT(*) OVER () FROM customers')).toThrow(/Window queries/);
    expect(() => assertAggregateOnlyQuery('SELECT ANY_VALUE(email), COUNT(*) FROM customers')).toThrow(/any_value/);
    expect(() => assertAggregateOnlyQuery('SELECT COUNT(*) AS xfrom, ANY_VALUE(email) FROM customers')).toThrow(/any_value/);
    expect(() => assertAggregateOnlyQuery('WITH totals AS (SELECT COUNT(*) FROM sales) SELECT * FROM totals')).toThrow(/direct SELECT/);
  });
});

describe('SQL compilers', () => {
  it('quotes identifiers and normalizes physical names', () => {
    expect(quoteIdentifier('a"b')).toBe('"a""b"');
    expect(normalizePhysicalName('  Chiffre d’affaires 2026 ')).toBe('chiffre_d_affaires_2026');
    expect(uniquePhysicalName('Sales', ['sales', 'sales_2'])).toBe('sales_3');
  });

  it('parameterizes filters', () => {
    expect(compileFilterPredicate('country', 'contains', 'Fra')).toEqual({
      sql: `CAST("country" AS VARCHAR) ILIKE '%' || ? || '%'`,
      values: ['Fra']
    });
  });

  it('compiles an ordered transformation pipeline', () => {
    const pipeline = compileTransformationPipeline('sales', [
      { id: '1', label: 'Filter', type: 'filter', column: 'amount', operator: 'gt', value: 10 },
      { id: '2', label: 'Rename', type: 'rename', column: 'amount', newName: 'revenue' },
      { id: '3', label: 'Sort', type: 'sort', column: 'revenue', direction: 'desc' }
    ]);
    expect(pipeline.sql).toContain('step_3');
    expect(pipeline.sql).toContain('RENAME');
    expect(pipeline.values).toEqual([10]);
  });
});
