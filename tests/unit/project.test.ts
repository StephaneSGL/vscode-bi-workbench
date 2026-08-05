import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, ProjectSchema, createEmptyProject, parseProject } from '../../src/shared/project.js';

describe('project schema', () => {
  it('creates a valid project with one report page', () => {
    const project = createEmptyProject('Retail analysis', new Date('2026-08-01T12:00:00Z'));
    expect(ProjectSchema.parse(project)).toEqual(project);
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.reports).toHaveLength(1);
    expect(project.reports[0]?.pages).toHaveLength(1);
  });

  it('rejects unknown schema versions and malformed relationships', () => {
    const project = createEmptyProject('Bad project');
    expect(() => parseProject({ ...project, schemaVersion: 99 })).toThrow(/Unsupported/);
    expect(() => ProjectSchema.parse({ ...project, relationships: [{ id: 'broken' }] })).toThrow();
  });

  it('migrates schema v1 presentation defaults without changing physical fields', () => {
    const current = createEmptyProject('Legacy');
    current.tables.push({
      id: 'sales',
      name: 'Sales',
      physicalName: 'sales',
      kind: 'imported',
      columns: [{ name: 'amount', dataType: 'DOUBLE', nullable: true }],
      rowCount: 2,
      transformations: []
    });
    current.reports[0]?.pages[0]?.visuals.push({
      id: 'chart',
      title: 'Revenue',
      type: 'bar',
      tableId: 'sales',
      categoryField: 'amount',
      valueField: 'amount',
      aggregation: 'sum',
      columns: [],
      limit: 100,
      width: 6,
      height: 4
    });
    const legacy = { ...current, schemaVersion: 1, theme: undefined };

    const migrated = parseProject(legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.tables[0]?.physicalName).toBe('sales');
    expect(migrated.tables[0]?.columns[0]).toMatchObject({
      name: 'amount',
      displayName: 'amount',
      hidden: false,
      semanticType: 'auto',
      format: 'auto'
    });
    expect(migrated.reports[0]?.pages[0]?.visuals[0]).toMatchObject({
      sortBy: 'auto',
      showLegend: true,
      legendPosition: 'bottom',
      interactionMode: 'filter'
    });
  });
});
