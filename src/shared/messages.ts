import { z } from 'zod';
import {
  FilterOperatorSchema,
  MeasureSchema,
  PageFilterSchema,
  RelationshipSchema,
  TransformationStepSchema,
  VisualSchema
} from './project.js';
import type { WorkbenchSection, WorkbenchState } from './state.js';

const IdSchema = z.string().min(1).max(512);

export const WebviewRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({
    type: z.literal('navigate'),
    section: z.enum(['home', 'import', 'data', 'query', 'transform', 'model', 'measures', 'reports', 'settings', 'help'])
  }),
  z.object({ type: z.literal('createProject'), name: z.string().min(1).max(120) }),
  z.object({ type: z.literal('openProject') }),
  z.object({ type: z.literal('saveProject') }),
  z.object({ type: z.literal('importData') }),
  z.object({ type: z.literal('previewTable'), tableId: IdSchema }),
  z.object({ type: z.literal('profileTable'), tableId: IdSchema }),
  z.object({ type: z.literal('runQuery'), sql: z.string().min(1).max(100_000) }),
  z.object({ type: z.literal('saveQuery'), name: z.string().min(1).max(200), sql: z.string().min(1).max(100_000) }),
  z.object({ type: z.literal('exportQuery'), format: z.enum(['csv', 'json']) }),
  z.object({
    type: z.literal('applyTransformations'),
    sourceTableId: IdSchema,
    targetName: z.string().min(1).max(200),
    steps: z.array(TransformationStepSchema).min(1)
  }),
  z.object({ type: z.literal('upsertRelationship'), relationship: RelationshipSchema }),
  z.object({ type: z.literal('deleteRelationship'), relationshipId: IdSchema }),
  z.object({ type: z.literal('upsertMeasure'), measure: MeasureSchema }),
  z.object({ type: z.literal('deleteMeasure'), measureId: IdSchema }),
  z.object({ type: z.literal('addReport'), name: z.string().min(1).max(200) }),
  z.object({ type: z.literal('addPage'), reportId: IdSchema, name: z.string().min(1).max(200) }),
  z.object({ type: z.literal('deleteReport'), reportId: IdSchema }),
  z.object({ type: z.literal('deletePage'), reportId: IdSchema, pageId: IdSchema }),
  z.object({ type: z.literal('upsertVisual'), reportId: IdSchema, pageId: IdSchema, visual: VisualSchema }),
  z.object({ type: z.literal('deleteVisual'), reportId: IdSchema, pageId: IdSchema, visualId: IdSchema }),
  z.object({ type: z.literal('upsertFilter'), reportId: IdSchema, pageId: IdSchema, filter: PageFilterSchema }),
  z.object({ type: z.literal('deleteFilter'), reportId: IdSchema, pageId: IdSchema, filterId: IdSchema }),
  z.object({
    type: z.literal('crossFilter'),
    reportId: IdSchema,
    pageId: IdSchema,
    tableId: IdSchema,
    column: z.string().min(1),
    operator: FilterOperatorSchema,
    value: z.unknown().optional()
  }),
  z.object({ type: z.literal('clearTemporaryFilters'), reportId: IdSchema, pageId: IdSchema }),
  z.object({ type: z.literal('loadPage'), reportId: IdSchema, pageId: IdSchema }),
  z.object({ type: z.literal('exportReport'), reportId: IdSchema, pageId: IdSchema }),
  z.object({ type: z.literal('openSettings') }),
  z.object({ type: z.literal('showLogs') }),
  z.object({ type: z.literal('openHelp') })
]);

export type WebviewRequest = z.infer<typeof WebviewRequestSchema>;

export type HostMessage =
  | { type: 'state'; state: WorkbenchState }
  | { type: 'operation'; operation: string; status: 'started' | 'finished' | 'failed'; message?: string }
  | { type: 'toast'; level: 'info' | 'warning' | 'error'; message: string }
  | { type: 'focus'; section: WorkbenchSection };
