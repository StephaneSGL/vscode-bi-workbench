import { describe, expect, it } from 'vitest';
import { ProjectSchema, createEmptyProject } from '../../src/shared/project.js';

describe('project schema', () => {
  it('creates a valid project with one report page', () => {
    const project = createEmptyProject('Retail analysis', new Date('2026-08-01T12:00:00Z'));
    expect(ProjectSchema.parse(project)).toEqual(project);
    expect(project.reports).toHaveLength(1);
    expect(project.reports[0]?.pages).toHaveLength(1);
  });

  it('rejects unknown schema versions and malformed relationships', () => {
    const project = createEmptyProject('Bad project');
    expect(() => ProjectSchema.parse({ ...project, schemaVersion: 2 })).toThrow();
    expect(() => ProjectSchema.parse({ ...project, relationships: [{ id: 'broken' }] })).toThrow();
  });
});
