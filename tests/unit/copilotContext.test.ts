import { describe, expect, it } from 'vitest';
import { buildCopilotContext, schemaToolPayload } from '../../src/copilot/context.js';
import type { ProjectManager } from '../../src/core/projectManager.js';
import { createEmptyProject } from '../../src/shared/project.js';

describe('Copilot schema privacy boundary', () => {
  it('excludes saved SQL and filter values from schema-only context and schema-tool output', async () => {
    const project = createEmptyProject('Privacy');
    project.tables.push({
      id: 'sales',
      name: 'Sales',
      physicalName: 'sales',
      kind: 'imported',
      rowCount: 1,
      transformations: [],
      columns: [{ name: 'customer', dataType: 'VARCHAR', nullable: true, displayName: 'Customer' }]
    });
    const timestamp = new Date().toISOString();
    project.queries.push({
      id: 'secret-query',
      name: 'Customer lookup',
      sql: "SELECT * FROM sales WHERE customer = 'SAVED_SQL_SECRET'",
      createdAt: timestamp,
      updatedAt: timestamp
    });
    project.reports[0]?.pages[0]?.filters.push({
      id: 'customer-filter',
      tableId: 'sales',
      column: 'customer',
      operator: 'eq',
      value: 'FILTER_VALUE_SECRET',
      secondValue: 'SECOND_FILTER_SECRET',
      temporary: false
    });
    const manager = { project } as ProjectManager;

    const context = await buildCopilotContext(manager, 'schema', 20);
    const schemaPayload = schemaToolPayload(manager);
    for (const payload of [context, schemaPayload]) {
      expect(payload).not.toContain('SAVED_SQL_SECRET');
      expect(payload).not.toContain('FILTER_VALUE_SECRET');
      expect(payload).not.toContain('SECOND_FILTER_SECRET');
      expect(payload).toContain('customer-filter');
    }
    expect(context).toContain('Customer lookup');
  });
});
