// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../src/shared/project.js';
import { initialWorkbenchState } from '../../src/shared/state.js';
import { renderApp } from '../../src/webview/render.js';

describe('workbench UI rendering', () => {
  it('renders a usable empty home with project actions', () => {
    const html = renderApp(initialWorkbenchState(), { transformationSteps: [] });
    document.body.innerHTML = html;
    expect(document.querySelector('[data-action="create-project"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Build a real local data project');
  });

  it('renders project navigation, data table, and report visual controls', () => {
    const project = createEmptyProject('Retail');
    project.tables.push({ id: 't', name: 'Sales', physicalName: 'sales', kind: 'imported', columns: [{ name: 'region', dataType: 'VARCHAR', nullable: true }, { name: 'amount', dataType: 'BIGINT', nullable: true }], rowCount: 2, transformations: [] });
    project.reports[0]?.pages[0]?.visuals.push({ id: 'v', title: 'Revenue', type: 'bar', tableId: 't', categoryField: 'region', valueField: 'amount', aggregation: 'sum', columns: [], limit: 100, width: 6, height: 4 });
    const state = initialWorkbenchState();
    state.project = project;
    state.activeSection = 'reports';
    state.selectedReportId = project.reports[0]?.id;
    state.selectedPageId = project.reports[0]?.pages[0]?.id;
    state.visualData = [{ visualId: 'v', columns: [{ name: 'category', dataType: 'VARCHAR', nullable: true }, { name: 'value', dataType: 'BIGINT', nullable: true }], rows: [{ category: 'North', value: '10' }], truncated: false }];
    document.body.innerHTML = renderApp(state, { transformationSteps: [] });
    expect(document.querySelectorAll('.nav-item')).toHaveLength(10);
    expect(document.querySelector('[data-action="add-visual"]')).not.toBeNull();
    expect(document.querySelector('[data-action="delete-report"]')).not.toBeNull();
    expect(document.querySelector('[data-action="delete-page"]')).not.toBeNull();
    expect(document.querySelector('#chart-v')).not.toBeNull();
    expect(document.body.textContent).toContain('Revenue');
  });

  it('renders slicer values as interactive cross-filter controls', () => {
    const project = createEmptyProject('Retail');
    project.tables.push({ id: 't', name: 'Sales', physicalName: 'sales', kind: 'imported', columns: [{ name: 'region', dataType: 'VARCHAR', nullable: true }], rowCount: 2, transformations: [] });
    project.reports[0]?.pages[0]?.visuals.push({ id: 's', title: 'Region', type: 'slicer', tableId: 't', categoryField: 'region', aggregation: 'none', columns: [], limit: 100, width: 6, height: 4 });
    const state = initialWorkbenchState();
    state.project = project;
    state.activeSection = 'reports';
    state.selectedReportId = project.reports[0]?.id;
    state.selectedPageId = project.reports[0]?.pages[0]?.id;
    state.visualData = [{ visualId: 's', columns: [{ name: 'category', dataType: 'VARCHAR', nullable: true }], rows: [{ category: 'North' }, { category: 'South' }], truncated: false }];

    document.body.innerHTML = renderApp(state, { transformationSteps: [] });

    const values = document.querySelectorAll<HTMLButtonElement>('[data-action="slicer-select"]');
    expect(values).toHaveLength(2);
    expect(values[0]?.dataset.tableId).toBe('t');
    expect(JSON.parse(decodeURIComponent(values[0]?.dataset.value ?? ''))).toBe('North');
  });
});
