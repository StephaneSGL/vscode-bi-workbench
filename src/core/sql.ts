import type { FilterOperator, PageFilter, TransformationStep } from '../shared/project.js';

const BLOCKED_STATEMENTS = [
  'alter',
  'attach',
  'call',
  'checkpoint',
  'comment',
  'copy',
  'create',
  'delete',
  'detach',
  'drop',
  'export',
  'grant',
  'import',
  'insert',
  'install',
  'load',
  'merge',
  'pragma',
  'reset',
  'revoke',
  'set',
  'truncate',
  'update',
  'use',
  'vacuum'
] as const;

const BLOCKED_FUNCTIONS = [
  'delta_scan',
  'glob',
  'http_get',
  'iceberg_scan',
  'mysql_scan',
  'postgres_scan',
  'query',
  'query_table',
  'read_blob',
  'read_csv',
  'read_csv_auto',
  'read_json',
  'read_json_auto',
  'read_ndjson',
  'read_parquet',
  'read_text',
  'read_xlsx',
  'sqlite_scan'
] as const;

export interface CompiledPredicate {
  sql: string;
  values: SqlParameter[];
}

export type SqlParameter = null | boolean | number | bigint | string;

export function quoteIdentifier(identifier: string): string {
  if (!identifier.trim()) {
    throw new Error('SQL identifier cannot be empty.');
  }
  if (identifier.includes('\0')) {
    throw new Error('SQL identifier contains a null byte.');
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function escapeSqlString(value: string): string {
  if (value.includes('\0')) {
    throw new Error('SQL string contains a null byte.');
  }
  return value.replaceAll("'", "''");
}

export function normalizePhysicalName(label: string, fallback = 'table'): string {
  const normalized = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
    .toLowerCase();
  const safe = normalized || fallback;
  return /^[0-9]/.test(safe) ? `t_${safe}` : safe;
}

export function uniquePhysicalName(label: string, existing: Iterable<string>): string {
  const used = new Set([...existing].map((name) => name.toLowerCase()));
  const base = normalizePhysicalName(label);
  if (!used.has(base)) {
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

function maskStringsAndComments(sql: string): { masked: string; semicolons: number[] } {
  let masked = '';
  const semicolons: number[] = [];
  let index = 0;

  while (index < sql.length) {
    const current = sql[index] ?? '';
    const next = sql[index + 1] ?? '';

    if (current === "'") {
      masked += ' ';
      index += 1;
      while (index < sql.length) {
        const char = sql[index] ?? '';
        masked += char === '\n' ? '\n' : ' ';
        if (char === "'" && sql[index + 1] === "'") {
          masked += ' ';
          index += 2;
          continue;
        }
        index += 1;
        if (char === "'") {
          break;
        }
      }
      continue;
    }

    if (current === '"') {
      masked += ' ';
      index += 1;
      while (index < sql.length) {
        const char = sql[index] ?? '';
        masked += char === '\n' ? '\n' : ' ';
        if (char === '"' && sql[index + 1] === '"') {
          masked += ' ';
          index += 2;
          continue;
        }
        index += 1;
        if (char === '"') {
          break;
        }
      }
      continue;
    }

    if (current === '-' && next === '-') {
      masked += '  ';
      index += 2;
      while (index < sql.length && sql[index] !== '\n') {
        masked += ' ';
        index += 1;
      }
      continue;
    }

    if (current === '/' && next === '*') {
      masked += '  ';
      index += 2;
      let closed = false;
      while (index < sql.length) {
        const char = sql[index] ?? '';
        const following = sql[index + 1] ?? '';
        if (char === '*' && following === '/') {
          masked += '  ';
          index += 2;
          closed = true;
          break;
        }
        masked += char === '\n' ? '\n' : ' ';
        index += 1;
      }
      if (!closed) {
        throw new Error('Unterminated SQL block comment.');
      }
      continue;
    }

    if (current === '$') {
      const tagMatch = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        masked += ' '.repeat(tag.length);
        index += tag.length;
        const end = sql.indexOf(tag, index);
        if (end < 0) {
          throw new Error('Unterminated SQL dollar-quoted string.');
        }
        const content = sql.slice(index, end);
        masked += content.replace(/[^\n]/g, ' ');
        masked += ' '.repeat(tag.length);
        index = end + tag.length;
        continue;
      }
    }

    if (current === ';') {
      semicolons.push(index);
    }
    masked += current;
    index += 1;
  }

  return { masked, semicolons };
}

export function trimTerminalSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, '').trim();
}

export function assertReadOnlyQuery(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error('The SQL query is empty.');
  }

  const { masked, semicolons } = maskStringsAndComments(trimmed);
  const withoutTerminal = trimTerminalSemicolon(trimmed);
  const terminalIndex = trimmed.lastIndexOf(';');
  if (semicolons.some((position) => position !== terminalIndex) || semicolons.length > 1) {
    throw new Error('Only one SQL statement is allowed.');
  }

  const normalized = masked.trim().toLowerCase();
  if (!/^(select|with)\b/.test(normalized)) {
    throw new Error('Only SELECT or WITH queries are allowed in the workbench.');
  }

  for (const keyword of BLOCKED_STATEMENTS) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(masked)) {
      throw new Error(`The SQL keyword ${keyword.toUpperCase()} is not allowed in read-only queries.`);
    }
  }

  for (const functionName of BLOCKED_FUNCTIONS) {
    if (new RegExp(`\\b${functionName}\\s*\\(`, 'i').test(masked)) {
      throw new Error(`The function ${functionName} is not allowed in ad-hoc queries.`);
    }
  }

  if (/\bfrom\s*'/i.test(trimmed) || /\bjoin\s*'/i.test(trimmed)) {
    throw new Error('Direct file paths are not allowed in ad-hoc queries. Use Import Data first.');
  }

  return withoutTerminal;
}

export function assertSafeMeasureExpression(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error('Measure expression cannot be empty.');
  }
  const { masked, semicolons } = maskStringsAndComments(trimmed);
  if (semicolons.length > 0) {
    throw new Error('Measure expressions cannot contain a statement separator.');
  }
  if (/\b(select|with|from|join|union|attach|copy|install|load|pragma|call)\b/i.test(masked)) {
    throw new Error('Measure expressions must be scalar aggregate expressions without subqueries.');
  }
  for (const functionName of BLOCKED_FUNCTIONS) {
    if (new RegExp(`\\b${functionName}\\s*\\(`, 'i').test(masked)) {
      throw new Error(`The function ${functionName} is not allowed in measures.`);
    }
  }
  return trimmed;
}

export function toSqlParameter(value: unknown): SqlParameter {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
}

export function compileFilterPredicate(
  column: string,
  operator: FilterOperator,
  value?: unknown,
  secondValue?: unknown
): CompiledPredicate {
  const field = quoteIdentifier(column);
  switch (operator) {
    case 'eq':
      return value === null ? { sql: `${field} IS NULL`, values: [] } : { sql: `${field} = ?`, values: [toSqlParameter(value)] };
    case 'neq':
      return value === null ? { sql: `${field} IS NOT NULL`, values: [] } : { sql: `${field} IS DISTINCT FROM ?`, values: [toSqlParameter(value)] };
    case 'contains':
      return { sql: `CAST(${field} AS VARCHAR) ILIKE '%' || ? || '%'`, values: [String(value ?? '')] };
    case 'gt':
      return { sql: `${field} > ?`, values: [toSqlParameter(value)] };
    case 'gte':
      return { sql: `${field} >= ?`, values: [toSqlParameter(value)] };
    case 'lt':
      return { sql: `${field} < ?`, values: [toSqlParameter(value)] };
    case 'lte':
      return { sql: `${field} <= ?`, values: [toSqlParameter(value)] };
    case 'between':
      return { sql: `${field} BETWEEN ? AND ?`, values: [toSqlParameter(value), toSqlParameter(secondValue)] };
    case 'isNull':
      return { sql: `${field} IS NULL`, values: [] };
    case 'isNotNull':
      return { sql: `${field} IS NOT NULL`, values: [] };
  }
}

export function compilePageFilters(filters: readonly PageFilter[], tableId: string): CompiledPredicate {
  const parts: string[] = [];
  const values: SqlParameter[] = [];
  for (const filter of filters.filter((item) => item.tableId === tableId)) {
    const predicate = compileFilterPredicate(filter.column, filter.operator, filter.value, filter.secondValue);
    parts.push(`(${predicate.sql})`);
    values.push(...predicate.values);
  }
  return {
    sql: parts.length > 0 ? parts.join(' AND ') : 'TRUE',
    values
  };
}

export interface CompiledTransformation {
  sql: string;
  values: SqlParameter[];
}

export function compileTransformationPipeline(sourceTable: string, steps: readonly TransformationStep[]): CompiledTransformation {
  if (steps.length === 0) {
    throw new Error('At least one transformation step is required.');
  }

  const ctes: string[] = [`step_0 AS (SELECT * FROM ${quoteIdentifier(sourceTable)})`];
  const values: SqlParameter[] = [];

  steps.forEach((step, index) => {
    const input = `step_${index}`;
    const output = `step_${index + 1}`;
    let selectSql: string;

    switch (step.type) {
      case 'select':
        selectSql = `SELECT ${step.columns.map(quoteIdentifier).join(', ')} FROM ${input}`;
        break;
      case 'rename':
        selectSql = `SELECT * RENAME (${quoteIdentifier(step.column)} AS ${quoteIdentifier(step.newName)}) FROM ${input}`;
        break;
      case 'cast':
        selectSql = `SELECT * REPLACE (TRY_CAST(${quoteIdentifier(step.column)} AS ${step.dataType}) AS ${quoteIdentifier(step.column)}) FROM ${input}`;
        break;
      case 'filter': {
        const predicate = compileFilterPredicate(step.column, step.operator, step.value, step.secondValue);
        selectSql = `SELECT * FROM ${input} WHERE ${predicate.sql}`;
        values.push(...predicate.values);
        break;
      }
      case 'fillNull':
        selectSql = `SELECT * REPLACE (COALESCE(${quoteIdentifier(step.column)}, ?) AS ${quoteIdentifier(step.column)}) FROM ${input}`;
        values.push(toSqlParameter(step.value));
        break;
      case 'deduplicate':
        selectSql = `SELECT DISTINCT * FROM ${input}`;
        break;
      case 'sort':
        selectSql = `SELECT * FROM ${input} ORDER BY ${quoteIdentifier(step.column)} ${step.direction.toUpperCase()}`;
        break;
    }

    ctes.push(`${output} AS (${selectSql})`);
  });

  return {
    sql: `WITH ${ctes.join(',\n')} SELECT * FROM step_${steps.length}`,
    values
  };
}
