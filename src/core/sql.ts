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
  'current_setting',
  'delta_scan',
  'getenv',
  'glob',
  'http_get',
  'iceberg_scan',
  'mysql_query',
  'mysql_scan',
  'parquet_scan',
  'postgres_query',
  'postgres_scan',
  'query',
  'query_table',
  'read_blob',
  'read_csv',
  'read_csv_auto',
  'read_json',
  'read_json_auto',
  'read_json_objects',
  'read_json_objects_auto',
  'read_ndjson',
  'read_ndjson_auto',
  'read_ndjson_objects',
  'read_ndjson_objects_auto',
  'read_parquet',
  'read_text',
  'read_xlsx',
  'sniff_csv',
  'sqlite_attach',
  'sqlite_query',
  'sqlite_scan'
] as const;

const BLOCKED_FUNCTION_PATTERNS = [
  /\bduckdb_[A-Za-z0-9_]*\s*\(/i,
  /\bhttp_[A-Za-z0-9_]*\s*\(/i,
  /\bpragma_[A-Za-z0-9_]*\s*\(/i,
  /\bread_[A-Za-z0-9_]*\s*\(/i,
  /\breadfile\s*\(/i,
  /\b[A-Za-z_][A-Za-z0-9_]*_scan\s*\(/i,
  /\b[A-Za-z_][A-Za-z0-9_]*_attach\s*\(/i,
  /\b[A-Za-z_][A-Za-z0-9_]*secret[A-Za-z0-9_]*\s*\(/i,
  /\bst_read(?:osm)?\s*\(/i
] as const;

const COPILOT_AGGREGATE_FUNCTIONS = new Set([
  'approx_count_distinct',
  'approx_quantile',
  'avg',
  'count',
  'max',
  'median',
  'min',
  'quantile',
  'stddev',
  'stddev_pop',
  'stddev_samp',
  'sum',
  'var_pop',
  'var_samp',
  'variance'
]);

const COPILOT_AGGREGATE_SCALAR_FUNCTIONS = new Set([
  'cast',
  'date_part',
  'date_trunc',
  'round',
  'try_cast'
]);

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

function maskStringsAndComments(sql: string, preserveQuotedIdentifiers = false): { masked: string; semicolons: number[] } {
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
      masked += preserveQuotedIdentifiers ? current : ' ';
      index += 1;
      while (index < sql.length) {
        const char = sql[index] ?? '';
        masked += preserveQuotedIdentifiers ? char : char === '\n' ? '\n' : ' ';
        if (char === '"' && sql[index + 1] === '"') {
          masked += preserveQuotedIdentifiers ? '"' : ' ';
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

  if (BLOCKED_FUNCTION_PATTERNS.some((pattern) => pattern.test(masked))) {
    throw new Error('External reader, scanner, attachment, network, secret, engine-metadata, or geospatial file functions are not allowed in ad-hoc queries.');
  }
  if (containsQuotedFunctionCall(trimmed)) {
    throw new Error('Quoted function names are not allowed in ad-hoc queries.');
  }

  if (/\bfrom\s*'/i.test(trimmed) || /\bjoin\s*'/i.test(trimmed)) {
    throw new Error('Direct file paths are not allowed in ad-hoc queries. Use Import Data first.');
  }

  return withoutTerminal;
}

export function assertAggregateOnlyQuery(sql: string): string {
  const safeSql = assertReadOnlyQuery(sql);
  const { masked } = maskStringsAndComments(safeSql);
  const normalized = masked.trim();
  if (!/^select\b/i.test(normalized)) {
    throw new Error('Aggregate sharing accepts one direct SELECT query; CTEs are disabled in this privacy mode.');
  }
  if ((normalized.match(/\bselect\b/gi) ?? []).length !== 1) {
    throw new Error('Subqueries are disabled in aggregate sharing mode.');
  }
  if (/\b(over|join|union|intersect|except|qualify)\b/i.test(normalized)) {
    throw new Error('Window queries, joins, and set operations are disabled in aggregate sharing mode.');
  }

  const fromIndex = findTopLevelKeyword(normalized, 'from');
  const selectClause = normalized.slice('select'.length, fromIndex < 0 ? undefined : fromIndex);
  if (hasTopLevelWildcard(selectClause)) {
    throw new Error('Top-level wildcards are disabled in aggregate sharing mode.');
  }

  const functions = [...selectClause.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)]
    .map((match) => (match[1] ?? '').toLowerCase());
  if (!functions.some((name) => COPILOT_AGGREGATE_FUNCTIONS.has(name))) {
    throw new Error('Aggregate sharing requires COUNT, SUM, AVG, MIN, MAX, MEDIAN, QUANTILE, STDDEV, VARIANCE, or APPROX_COUNT_DISTINCT.');
  }
  const unsupportedFunction = functions.find((name) =>
    !COPILOT_AGGREGATE_FUNCTIONS.has(name) && !COPILOT_AGGREGATE_SCALAR_FUNCTIONS.has(name)
  );
  if (unsupportedFunction) {
    throw new Error(`The function ${unsupportedFunction} is not allowed in the aggregate SELECT list.`);
  }
  return safeSql;
}

function findTopLevelKeyword(sql: string, keyword: string): number {
  let depth = 0;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const previous = index === 0 ? '' : (sql[index - 1] ?? '');
    if (depth === 0 && !/[A-Za-z0-9_]/.test(previous) && sql.slice(index).match(new RegExp(`^${keyword}\\b`, 'i'))) {
      return index;
    }
  }
  return -1;
}

function hasTopLevelWildcard(selectClause: string): boolean {
  let depth = 0;
  for (const character of selectClause) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    } else if (character === '*' && depth === 0) {
      return true;
    }
  }
  return false;
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
  if (BLOCKED_FUNCTION_PATTERNS.some((pattern) => pattern.test(masked))) {
    throw new Error('External reader, scanner, attachment, network, secret, or engine-metadata functions are not allowed in measures.');
  }
  if (containsQuotedFunctionCall(trimmed)) {
    throw new Error('Quoted function names are not allowed in measures.');
  }
  return trimmed;
}

function containsQuotedFunctionCall(sql: string): boolean {
  const { masked } = maskStringsAndComments(sql, true);
  return /"(?:[^"]|"")*"\s*\(/.test(masked);
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
  return compileFilterExpression(quoteIdentifier(column), operator, value, secondValue);
}

export function compileFilterExpression(
  field: string,
  operator: FilterOperator,
  value?: unknown,
  secondValue?: unknown
): CompiledPredicate {
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
      case 'replace':
        if (step.mode === 'substring') {
          selectSql = `SELECT * REPLACE (REPLACE(CAST(${quoteIdentifier(step.column)} AS VARCHAR), CAST(? AS VARCHAR), CAST(? AS VARCHAR)) AS ${quoteIdentifier(step.column)}) FROM ${input}`;
        } else {
          selectSql = `SELECT * REPLACE (CASE WHEN ${quoteIdentifier(step.column)} IS NOT DISTINCT FROM ? THEN ? ELSE ${quoteIdentifier(step.column)} END AS ${quoteIdentifier(step.column)}) FROM ${input}`;
        }
        values.push(toSqlParameter(step.find), toSqlParameter(step.replacement));
        break;
      case 'datePart': {
        const datePart = step.part === 'dayOfWeek' ? 'dow' : step.part;
        selectSql = `SELECT *, DATE_PART('${datePart}', TRY_CAST(${quoteIdentifier(step.column)} AS TIMESTAMP)) AS ${quoteIdentifier(step.newName)} FROM ${input}`;
        break;
      }
      case 'group': {
        const groups = step.groupBy.map(quoteIdentifier);
        const aggregates = step.aggregations.map((aggregation) => {
          const column = quoteIdentifier(aggregation.column);
          const expression = aggregation.function === 'countDistinct'
            ? `COUNT(DISTINCT ${column})`
            : `${aggregation.function.toUpperCase()}(${column})`;
          return `${expression} AS ${quoteIdentifier(aggregation.name)}`;
        });
        const selections = [...groups, ...aggregates].join(', ');
        const groupBy = groups.length > 0 ? ` GROUP BY ${groups.join(', ')}` : '';
        selectSql = `SELECT ${selections} FROM ${input}${groupBy}`;
        break;
      }
    }

    ctes.push(`${output} AS (${selectSql})`);
  });

  return {
    sql: `WITH ${ctes.join(',\n')} SELECT * FROM step_${steps.length}`,
    values
  };
}
