// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebviewRequest } from '../../src/shared/messages.js';
import { createEmptyProject } from '../../src/shared/project.js';
import { initialWorkbenchState } from '../../src/shared/state.js';

describe('workbench webview interactions', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('posts complete visual and table edits from real form interactions', async () => {
    const requests: WebviewRequest[] = [];
    Object.defineProperty(globalThis, 'acquireVsCodeApi', {
      configurable: true,
      value: () => ({
        postMessage: (message: WebviewRequest) => requests.push(message),
        getState: () => undefined,
        setState: () => undefined
      })
    });

    await import('../../src/webview/main.js');
    expect(requests[0]).toEqual({ type: 'ready' });

    const project = createEmptyProject('Retail');
    project.tables.push({
      id: 'sales', name: 'Sales', physicalName: 'sales', kind: 'imported', rowCount: 2, transformations: [],
      columns: [
        { name: 'region', displayName: 'Region', dataType: 'VARCHAR', nullable: true },
        { name: 'amount', displayName: 'Revenue', format: 'currency', dataType: 'BIGINT', nullable: true }
      ]
    });
    const report = project.reports[0];
    const page = report?.pages[0];
    page?.visuals.push({
      id: 'table-visual', title: 'Sales detail', type: 'table', tableId: 'sales', aggregation: 'none', columns: ['region', 'amount'],
      limit: 100, width: 6, height: 4, sortField: 'amount', sortDirection: 'desc', numberFormat: 'auto', currency: 'EUR', decimals: 2
    });
    const state = initialWorkbenchState();
    state.project = project;
    state.activeSection = 'reports';
    state.selectedReportId = report?.id;
    state.selectedPageId = page?.id;
    state.visualData = [{
      visualId: 'table-visual',
      columns: [{ name: 'Region', dataType: 'VARCHAR', nullable: true }, { name: 'Revenue', dataType: 'BIGINT', nullable: true }],
      rows: [{ Region: 'North', Revenue: 42 }],
      truncated: false
    }];
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state } }));

    (document.querySelector('[data-action="edit-visual"]') as HTMLButtonElement).click();
    expect((document.querySelector('#visual-title') as HTMLInputElement).value).toBe('Sales detail');
    const sortField = document.querySelector('#visual-sort-field') as HTMLSelectElement;
    expect(sortField.innerHTML).toMatch(/value="amount" selected/);
    // happy-dom does not honor a later selected option; assigning it also models a user choice.
    sortField.value = 'amount';
    (document.querySelector('#visual-width') as HTMLInputElement).value = '10';
    (document.querySelector('#visual-column-order') as HTMLInputElement).value = 'amount, region';
    (document.querySelector('#visual-show-labels') as HTMLInputElement).checked = true;
    (document.querySelector('[data-action="save-visual"]') as HTMLButtonElement).click();

    const visualRequest = requests.at(-1);
    expect(visualRequest?.type).toBe('upsertVisual');
    if (visualRequest?.type === 'upsertVisual') {
      expect(visualRequest.visual.id).toBe('table-visual');
      expect(visualRequest.visual.width).toBe(10);
      expect(visualRequest.visual.columns).toEqual(['amount', 'region']);
      expect(visualRequest.visual.showLabels).toBe(true);
      expect(visualRequest.visual.sortField).toBe('amount');
    }

    state.activeSection = 'model';
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state } }));
    (document.querySelector('.column-display-name') as HTMLInputElement).value = 'Sales region';
    (document.querySelector('[data-action="save-table-presentation"]') as HTMLButtonElement).click();
    const tableRequest = requests.at(-1);
    expect(tableRequest?.type).toBe('updateTablePresentation');
    if (tableRequest?.type === 'updateTablePresentation') {
      expect(tableRequest.presentation.columns[0]?.displayName).toBe('Sales region');
      expect(tableRequest.presentation.columns).toHaveLength(2);
    }
  });
});
