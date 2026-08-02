import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 2 as const;

export const DisplayFormatSchema = z.enum(['auto', 'number', 'integer', 'currency', 'percent', 'date', 'datetime', 'text']);
export type DisplayFormat = z.infer<typeof DisplayFormatSchema>;

export const SemanticTypeSchema = z.enum(['auto', 'category', 'measure', 'date', 'geography', 'identifier']);
export type SemanticType = z.infer<typeof SemanticTypeSchema>;

export const SOURCE_KINDS = ['csv', 'tsv', 'json', 'jsonl', 'parquet', 'xlsx', 'duckdb', 'sqlite'] as const;
export const SourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const ColumnSchema = z.object({
  name: z.string().min(1).max(512),
  dataType: z.string().min(1).max(256),
  nullable: z.boolean(),
  displayName: z.string().min(1).max(512).optional(),
  description: z.string().max(2000).optional(),
  hidden: z.boolean().optional(),
  semanticType: SemanticTypeSchema.optional(),
  format: DisplayFormatSchema.optional()
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
  }),
  StepBaseSchema.extend({
    type: z.literal('replace'),
    column: z.string().min(1),
    find: z.unknown(),
    replacement: z.unknown(),
    mode: z.enum(['exact', 'substring'])
  }),
  StepBaseSchema.extend({
    type: z.literal('datePart'),
    column: z.string().min(1),
    part: z.enum(['year', 'quarter', 'month', 'week', 'day', 'dayOfWeek', 'hour']),
    newName: z.string().min(1).max(512)
  }),
  StepBaseSchema.extend({
    type: z.literal('group'),
    groupBy: z.array(z.string().min(1)),
    aggregations: z.array(z.object({
      column: z.string().min(1),
      function: z.enum(['count', 'countDistinct', 'sum', 'avg', 'min', 'max']),
      name: z.string().min(1).max(512)
    })).min(1)
  })
]);
export type TransformationStep = z.infer<typeof TransformationStepSchema>;

export const TableModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(512),
  description: z.string().max(2000).optional(),
  physicalName: z.string().min(1).max(512),
  kind: z.enum(['imported', 'derived']),
  sourceId: z.string().min(1).optional(),
  sourceTableId: z.string().min(1).optional(),
  columns: z.array(ColumnSchema),
  rowCount: z.number().int().nonnegative(),
  transformations: z.array(TransformationStepSchema).default([])
});
export type TableModel = z.infer<typeof TableModelSchema>;

export const ColumnPresentationSchema = z.object({
  name: z.string().min(1).max(512),
  displayName: z.string().min(1).max(512),
  description: z.string().max(2000).default(''),
  hidden: z.boolean().default(false),
  semanticType: SemanticTypeSchema.default('auto'),
  format: DisplayFormatSchema.default('auto')
});
export type ColumnPresentation = z.infer<typeof ColumnPresentationSchema>;

export const TablePresentationSchema = z.object({
  name: z.string().min(1).max(512),
  description: z.string().max(2000).default(''),
  columns: z.array(ColumnPresentationSchema).min(1)
});
export type TablePresentation = z.infer<typeof TablePresentationSchema>;

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
  description: z.string().max(2000).optional(),
  type: VisualTypeSchema,
  tableId: z.string().min(1),
  categoryField: z.string().min(1).optional(),
  seriesField: z.string().min(1).optional(),
  valueField: z.string().min(1).optional(),
  measureId: z.string().min(1).optional(),
  aggregation: z.enum(['none', 'count', 'countDistinct', 'sum', 'avg', 'min', 'max']).default('sum'),
  columns: z.array(z.string().min(1)).default([]),
  limit: z.number().int().min(1).max(1000).default(100),
  width: z.number().int().min(1).max(12).default(6),
  height: z.number().int().min(2).max(12).default(4),
  sortField: z.string().min(1).optional(),
  sortBy: z.enum(['auto', 'category', 'value']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  showLegend: z.boolean().optional(),
  legendPosition: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  showLabels: z.boolean().optional(),
  smooth: z.boolean().optional(),
  numberFormat: DisplayFormatSchema.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  decimals: z.number().int().min(0).max(6).optional(),
  interactionMode: z.enum(['filter', 'none']).optional()
});
export type Visual = z.infer<typeof VisualSchema>;

export const ReportPageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visuals: z.array(VisualSchema),
  filters: z.array(PageFilterSchema)
});
export type ReportPage = z.infer<typeof ReportPageSchema>;

export const ReportSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  pages: z.array(ReportPageSchema).min(1)
});
export type Report = z.infer<typeof ReportSchema>;

export const ProjectThemeSchema = z.object({
  name: z.string().min(1).max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(20)
});
export type ProjectTheme = z.infer<typeof ProjectThemeSchema>;

export const DEFAULT_PROJECT_THEME: ProjectTheme = {
  name: 'Workbench',
  primaryColor: '#5b7cfa',
  palette: ['#5b7cfa', '#38b2ac', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981']
};

export const ProjectSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
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
  reports: z.array(ReportSchema),
  theme: ProjectThemeSchema
});
export type BiProject = z.infer<typeof ProjectSchema>;

const ProjectV1Schema = ProjectSchema.extend({
  schemaVersion: z.literal(1),
  theme: ProjectThemeSchema.optional()
});

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
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
    ],
    theme: DEFAULT_PROJECT_THEME
  });
}

export function parseProject(value: unknown): BiProject {
  const version = projectSchemaVersion(value);
  if (version === CURRENT_SCHEMA_VERSION) {
    return ProjectSchema.parse(value);
  }
  if (version !== 1) {
    throw new Error(`Unsupported BI project schema version: ${String(version)}.`);
  }

  const project = ProjectV1Schema.parse(value);
  return ProjectSchema.parse({
    ...project,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    theme: project.theme ?? DEFAULT_PROJECT_THEME,
    tables: project.tables.map((table) => ({
      ...table,
      description: table.description ?? '',
      columns: table.columns.map((column) => ({
        ...column,
        displayName: column.displayName ?? column.name,
        description: column.description ?? '',
        hidden: column.hidden ?? false,
        semanticType: column.semanticType ?? 'auto',
        format: column.format ?? 'auto'
      }))
    })),
    reports: project.reports.map((report) => ({
      ...report,
      description: report.description ?? '',
      pages: report.pages.map((page) => ({
        ...page,
        description: page.description ?? '',
        visuals: page.visuals.map((visual) => ({
          ...visual,
          description: visual.description ?? '',
          sortBy: visual.sortBy ?? 'auto',
          sortDirection: visual.sortDirection ?? (['line', 'area', 'scatter'].includes(visual.type) ? 'asc' : 'desc'),
          showLegend: visual.showLegend ?? true,
          legendPosition: visual.legendPosition ?? 'bottom',
          showLabels: visual.showLabels ?? false,
          smooth: visual.smooth ?? false,
          numberFormat: visual.numberFormat ?? 'auto',
          currency: visual.currency ?? 'EUR',
          decimals: visual.decimals ?? 2,
          interactionMode: visual.interactionMode ?? 'filter'
        }))
      }))
    }))
  });
}

export function projectSchemaVersion(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value)) {
    return undefined;
  }
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) ? version : undefined;
}
