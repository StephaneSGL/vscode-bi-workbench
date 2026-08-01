import { z } from 'zod';

export const SOURCE_KINDS = ['csv', 'tsv', 'json', 'jsonl', 'parquet', 'xlsx', 'duckdb'] as const;
export const SourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const ColumnSchema = z.object({
  name: z.string().min(1).max(512),
  dataType: z.string().min(1).max(256),
  nullable: z.boolean()
});
export type Column = z.infer<typeof ColumnSchema>;

export const DataSourceSchema = z.object({
  id: z.string().min(1),
  kind: SourceKindSchema,
  name: z.string().min(1).max(512),
  location: z.string().min(1),
  importedAt: z.string().datetime()
});
export type DataSource = z.infer<typeof DataSourceSchema>;

const StepBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200)
});

export const FilterOperatorSchema = z.enum([
  'eq',
  'neq',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'isNull',
  'isNotNull'
]);
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

export const TransformationStepSchema = z.discriminatedUnion('type', [
  StepBaseSchema.extend({
    type: z.literal('select'),
    columns: z.array(z.string().min(1)).min(1)
  }),
  StepBaseSchema.extend({
    type: z.literal('rename'),
    column: z.string().min(1),
    newName: z.string().min(1)
  }),
  StepBaseSchema.extend({
    type: z.literal('cast'),
    column: z.string().min(1),
    dataType: z.enum(['VARCHAR', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'DATE', 'TIMESTAMP'])
  }),
  StepBaseSchema.extend({
    type: z.literal('filter'),
    column: z.string().min(1),
    operator: FilterOperatorSchema,
    value: z.unknown().optional(),
    secondValue: z.unknown().optional()
  }),
  StepBaseSchema.extend({
    type: z.literal('fillNull'),
    column: z.string().min(1),
    value: z.unknown()
  }),
  StepBaseSchema.extend({
    type: z.literal('deduplicate')
  }),
  StepBaseSchema.extend({
    type: z.literal('sort'),
    column: z.string().min(1),
    direction: z.enum(['asc', 'desc'])
  })
]);
export type TransformationStep = z.infer<typeof TransformationStepSchema>;

export const TableModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(512),
  physicalName: z.string().min(1).max(512),
  kind: z.enum(['imported', 'derived']),
  sourceId: z.string().min(1).optional(),
  sourceTableId: z.string().min(1).optional(),
  columns: z.array(ColumnSchema),
  rowCount: z.number().int().nonnegative(),
  transformations: z.array(TransformationStepSchema).default([])
});
export type TableModel = z.infer<typeof TableModelSchema>;

export const RelationshipSchema = z.object({
  id: z.string().min(1),
  fromTableId: z.string().min(1),
  fromColumn: z.string().min(1),
  toTableId: z.string().min(1),
  toColumn: z.string().min(1),
  cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many']),
  filterDirection: z.enum(['single', 'both']),
  active: z.boolean()
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const MeasureSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  tableId: z.string().min(1),
  expression: z.string().min(1).max(4000),
  format: z.enum(['number', 'integer', 'currency', 'percent', 'text'])
});
export type Measure = z.infer<typeof MeasureSchema>;

export const SavedQuerySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  sql: z.string().min(1).max(100_000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type SavedQuery = z.infer<typeof SavedQuerySchema>;

export const PageFilterSchema = z.object({
  id: z.string().min(1),
  tableId: z.string().min(1),
  column: z.string().min(1),
  operator: FilterOperatorSchema,
  value: z.unknown().optional(),
  secondValue: z.unknown().optional(),
  temporary: z.boolean().default(false)
});
export type PageFilter = z.infer<typeof PageFilterSchema>;

export const VISUAL_TYPES = [
  'table',
  'kpi',
  'bar',
  'horizontalBar',
  'line',
  'area',
  'pie',
  'donut',
  'scatter',
  'slicer'
] as const;
export const VisualTypeSchema = z.enum(VISUAL_TYPES);
export type VisualType = z.infer<typeof VisualTypeSchema>;

export const VisualSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  type: VisualTypeSchema,
  tableId: z.string().min(1),
  categoryField: z.string().min(1).optional(),
  valueField: z.string().min(1).optional(),
  measureId: z.string().min(1).optional(),
  aggregation: z.enum(['none', 'count', 'countDistinct', 'sum', 'avg', 'min', 'max']).default('sum'),
  columns: z.array(z.string().min(1)).default([]),
  limit: z.number().int().min(1).max(1000).default(100),
  width: z.number().int().min(1).max(12).default(6),
  height: z.number().int().min(2).max(12).default(4)
});
export type Visual = z.infer<typeof VisualSchema>;

export const ReportPageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  visuals: z.array(VisualSchema),
  filters: z.array(PageFilterSchema)
});
export type ReportPage = z.infer<typeof ReportPageSchema>;

export const ReportSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  pages: z.array(ReportPageSchema).min(1)
});
export type Report = z.infer<typeof ReportSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sources: z.array(DataSourceSchema),
  tables: z.array(TableModelSchema),
  relationships: z.array(RelationshipSchema),
  measures: z.array(MeasureSchema),
  queries: z.array(SavedQuerySchema),
  reports: z.array(ReportSchema)
});
export type BiProject = z.infer<typeof ProjectSchema>;

export interface QueryResult {
  columns: Column[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export interface ColumnProfile {
  column: Column;
  nullCount: number;
  distinctCount: number;
  minimum?: unknown;
  maximum?: unknown;
  average?: number;
}

export interface VisualData {
  visualId: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  error?: string;
}

export function createEmptyProject(name: string, now = new Date()): BiProject {
  const timestamp = now.toISOString();
  return ProjectSchema.parse({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    description: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    sources: [],
    tables: [],
    relationships: [],
    measures: [],
    queries: [],
    reports: [
      {
        id: crypto.randomUUID(),
        name: 'Report 1',
        pages: [
          {
            id: crypto.randomUUID(),
            name: 'Page 1',
            visuals: [],
            filters: []
          }
        ]
      }
    ]
  });
}
