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
    expect(document.querySelector('.ribbon')).not.toBeNull();
    expect(document.querySelector('[data-action="open-copilot"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Build a real local data project');
  });

  it('renders project navigation, data table, and report visual controls', () => {
    const project = createEmptyProject('Retail');
    project.tables.push({ id: 't', name: 'Sales', physicalName: 'sales', kind: 'imported', columns: [{ name: 'region', dataType: 'VARCHAR', nullable: true }, { name: 'amount', dataType: 'BIGINT', nullable: true }], rowCount: 2, transformations: [] });
    project.reports[0]?.pages[0]?.visuals.push({ id: 'v', title: 'Revenue', type: 'bar', tableId: 't', categoryField: 'region', valueField: 'amount', aggregation: 'sum', columns: [], limit: 100, width: 6, height: 4, backgroundColor: '#ffffff' });
    const state = initialWorkbenchState();
    state.project = project;
    state.activeSection = 'reports';
    state.selectedReportId = project.reports[0]?.id;
    state.selectedPageId = project.reports[0]?.pages[0]?.id;
    state.visualData = [{ visualId: 'v', columns: [{ name: 'category', dataType: 'VARCHAR', nullable: true }, { name: 'value', dataType: 'BIGINT', nullable: true }], rows: [{ category: 'North', value: '10' }], truncated: false }];
    document.body.innerHTML = renderApp(state, { transformationSteps: [] });
    expect(document.querySelectorAll('.nav-item')).toHaveLength(10);
    expect(document.querySelector('[data-action="save-visual"]')).not.toBeNull();
    expect(document.querySelector('[data-action="edit-visual"]')).not.toBeNull();
    expect(document.querySelector('[data-action="duplicate-visual"]')).not.toBeNull();
    expect(document.querySelector('#visual-series')).not.toBeNull();
    expect(document.querySelector('#visual-width')).not.toBeNull();
    expect(document.querySelector('[data-action="delete-report"]')).not.toBeNull();
    expect(document.querySelector('[data-action="delete-page"]')).not.toBeNull();
    expect(document.querySelector('.report-studio')).not.toBeNull();
    expect(document.querySelector('.report-inspector')).not.toBeNull();
    expect(document.querySelector('.filters-pane')).not.toBeNull();
    expect(document.querySelector('.fields-pane')).not.toBeNull();
    expect(document.querySelector('#chart-v')).not.toBeNull();
    expect(document.querySelector<HTMLElement>('[data-visual-id="v"]')?.getAttribute('style')).toContain('--visual-foreground:#111827');
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

  it('falls back to the default theme while a legacy project state is being migrated', () => {
    const project = createEmptyProject('Legacy retail');
    project.tables.push({ id: 't', name: 'Sales', physicalName: 'sales', kind: 'imported', columns: [{ name: 'amount', dataType: 'BIGINT', nullable: true }], rowCount: 1, transformations: [] });
    project.reports[0]?.pages[0]?.visuals.push({ id: 'k', title: 'Revenue', type: 'kpi', tableId: 't', valueField: 'amount', aggregation: 'sum', columns: [], limit: 100, width: 4, height: 4 });
    delete (project as Partial<typeof project>).theme;
    const state = initialWorkbenchState();
    state.project = project;
    state.activeSection = 'reports';
    state.selectedReportId = project.reports[0]?.id;
    state.selectedPageId = project.reports[0]?.pages[0]?.id;

    expect(() => renderApp(state, { transformationSteps: [] })).not.toThrow();
  });

  it('renders editable semantic metadata, measures, and themes', () => {
    const project = createEmptyProject('Retail');
    project.tables.push({
      id: 't', name: 'Sales', description: 'Facts', physicalName: 'sales', kind: 'imported', rowCount: 2, transformations: [],
      columns: [{ name: 'amount', displayName: 'Revenue', description: '', hidden: false, semanticType: 'measure', format: 'currency', dataType: 'BIGINT', nullable: true }]
    });
    project.measures.push({ id: 'm', name: 'Total', description: '', tableId: 't', expression: 'SUM("amount")', format: 'currency' });
    const state = initialWorkbenchState();
    state.project = project;
    state.activeSection = 'model';
    document.body.innerHTML = renderApp(state, { transformationSteps: [], modelTableId: 't' });
    expect(document.querySelector('[data-action="save-table-presentation"]')).not.toBeNull();
    expect((document.querySelector('.column-display-name') as HTMLInputElement).value).toBe('Revenue');

    state.activeSection = 'measures';
    document.body.innerHTML = renderApp(state, { transformationSteps: [], editingMeasureId: 'm' });
    expect((document.querySelector('#measure-name') as HTMLInputElement).value).toBe('Total');
    expect(document.querySelector('[data-action="cancel-measure-edit"]')).not.toBeNull();

    state.activeSection = 'settings';
    document.body.innerHTML = renderApp(state, { transformationSteps: [] });
    expect(document.querySelector('[data-action="save-theme"]')).not.toBeNull();
  });
});
