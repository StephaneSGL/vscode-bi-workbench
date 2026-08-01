import './styles.css';
import type { HostMessage, WebviewRequest } from '../shared/messages.js';
import type { FilterOperator, TransformationStep, Visual } from '../shared/project.js';
import { initialWorkbenchState, type WorkbenchState } from '../shared/state.js';
import { disposeCharts, renderCharts } from './charts.js';
import { renderApp, type UiDraft } from './render.js';

declare function acquireVsCodeApi<T = unknown>(): {
  postMessage(message: WebviewRequest): void;
  getState(): T | undefined;
  setState(state: T): void;
};

const vscode = acquireVsCodeApi<{ transformationSteps: TransformationStep[] }>();
const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('BI Workbench root element is missing.');
const root: HTMLElement = rootElement;

let state: WorkbenchState = initialWorkbenchState();
const restored = vscode.getState();
const draft: UiDraft = { transformationSteps: restored?.transformationSteps ?? [] };
let toastTimer: number | undefined;

function post(message: WebviewRequest): void {
  vscode.postMessage(message);
}

function render(): void {
  disposeCharts();
  root.innerHTML = renderApp(state, draft);
  vscode.setState({ transformationSteps: draft.transformationSteps });
  renderCharts(state, (visual, value) => {
    if (!state.selectedReportId || !state.selectedPageId || !visual.categoryField) return;
    post({
      type: 'crossFilter',
      reportId: state.selectedReportId,
      pageId: state.selectedPageId,
      tableId: visual.tableId,
      column: visual.categoryField,
      operator: 'eq',
      value
    });
  });
}

root.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  void handleAction(action ?? '', button);
});

root.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement;
  if (target.id === 'transform-source') draft.transformSourceId = target.value;
  if (target.id === 'rel-from-table') draft.relationshipFromTableId = target.value;
  if (target.id === 'rel-to-table') draft.relationshipToTableId = target.value;
  if (target.id === 'filter-table') draft.filterTableId = target.value;
  if (target.id === 'visual-table') draft.visualTableId = target.value;
  if (['transform-source', 'rel-from-table', 'rel-to-table', 'filter-table', 'visual-table'].includes(target.id)) render();
});

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message.type === 'state') {
    state = message.state;
    render();
  } else if (message.type === 'operation') {
    draft.busy = message.status === 'started' ? message.operation : undefined;
    render();
  } else if (message.type === 'toast') {
    showToast(message.level, message.message);
  } else if (message.type === 'focus') {
    state.activeSection = message.section;
    render();
  }
});

async function handleAction(action: string, element: HTMLElement): Promise<void> {
  switch (action) {
    case 'navigate': post({ type: 'navigate', section: element.dataset.section as WorkbenchState['activeSection'] }); break;
    case 'create-project': post({ type: 'createProject', name: 'New project' }); break;
    case 'open-project': post({ type: 'openProject' }); break;
    case 'save-project': post({ type: 'saveProject' }); break;
    case 'import-data': post({ type: 'importData' }); break;
    case 'show-logs': post({ type: 'showLogs' }); break;
    case 'open-help': post({ type: 'openHelp' }); break;
    case 'open-settings': post({ type: 'openSettings' }); break;
    case 'preview-table': post({ type: 'previewTable', tableId: requiredData(element, 'tableId') }); break;
    case 'profile-table': post({ type: 'profileTable', tableId: requiredData(element, 'tableId') }); break;
    case 'run-query': post({ type: 'runQuery', sql: value('query-sql') }); break;
    case 'save-query': post({ type: 'saveQuery', name: value('query-name'), sql: value('query-sql') }); break;
    case 'export-query': post({ type: 'exportQuery', format: requiredData(element, 'format') as 'csv' | 'json' }); break;
    case 'insert-field': insertField(requiredData(element, 'table'), requiredData(element, 'column')); break;
    case 'load-query': loadSavedQuery(requiredData(element, 'queryId')); break;
    case 'add-transform-step': addTransformationStep(); break;
    case 'remove-transform-step': draft.transformationSteps.splice(Number(requiredData(element, 'index')), 1); render(); break;
    case 'clear-transform': draft.transformationSteps = []; render(); break;
    case 'apply-transform': applyTransformations(); break;
    case 'add-relationship': addRelationship(); break;
    case 'delete-relationship': if (window.confirm('Delete this relationship?')) post({ type: 'deleteRelationship', relationshipId: requiredData(element, 'id') }); break;
    case 'add-measure': addMeasure(); break;
    case 'delete-measure': if (window.confirm('Delete this measure?')) post({ type: 'deleteMeasure', measureId: requiredData(element, 'id') }); break;
    case 'add-report': post({ type: 'addReport', name: value('new-report-name') || 'New report' }); break;
    case 'add-page': if (state.selectedReportId) post({ type: 'addPage', reportId: state.selectedReportId, name: value('new-page-name') || 'New page' }); break;
    case 'delete-report': if (window.confirm('Delete the selected report?')) post({ type: 'deleteReport', reportId: requiredData(element, 'id') }); break;
    case 'delete-page': if (state.selectedReportId && window.confirm('Delete the selected page?')) post({ type: 'deletePage', reportId: state.selectedReportId, pageId: requiredData(element, 'id') }); break;
    case 'load-page': post({ type: 'loadPage', reportId: requiredData(element, 'reportId'), pageId: requiredData(element, 'pageId') }); break;
    case 'add-visual': addVisual(); break;
    case 'delete-visual': if (window.confirm('Delete this visual?')) deleteVisual(requiredData(element, 'id')); break;
    case 'add-filter': addFilter(); break;
    case 'delete-filter': deleteFilter(requiredData(element, 'id')); break;
    case 'slicer-select': applySlicer(element); break;
    case 'clear-interactions': clearInteractions(); break;
    case 'export-report': exportReport(); break;
  }
}

function addTransformationStep(): void {
  const type = value('transform-type') as TransformationStep['type'];
  const column = value('transform-column');
  const parameter = value('transform-value');
  const option = value('transform-operator');
  const base = { id: crypto.randomUUID(), label: labelForStep(type) };
  let step: TransformationStep;
  switch (type) {
    case 'select': step = { ...base, type, columns: parameter.split(',').map((item) => item.trim()).filter(Boolean) }; break;
    case 'rename': step = { ...base, type, column, newName: parameter }; break;
    case 'cast': step = { ...base, type, column, dataType: option as 'VARCHAR' | 'BIGINT' | 'DOUBLE' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP' }; break;
    case 'filter': step = { ...base, type, column, operator: option as FilterOperator, value: parseValue(parameter), secondValue: parseValue(value('transform-second-value')) }; break;
    case 'fillNull': step = { ...base, type, column, value: parseValue(parameter) }; break;
    case 'deduplicate': step = { ...base, type }; break;
    case 'sort': step = { ...base, type, column, direction: option === 'desc' ? 'desc' : 'asc' }; break;
  }
  draft.transformationSteps.push(step);
  render();
}

function applyTransformations(): void {
  const sourceTableId = value('transform-source');
  const targetName = value('transform-target');
  if (!sourceTableId || !targetName || draft.transformationSteps.length === 0) return;
  post({ type: 'applyTransformations', sourceTableId, targetName, steps: draft.transformationSteps });
  draft.transformationSteps = [];
}

function addRelationship(): void {
  post({ type: 'upsertRelationship', relationship: {
    id: crypto.randomUUID(),
    fromTableId: value('rel-from-table'),
    fromColumn: value('rel-from-column'),
    toTableId: value('rel-to-table'),
    toColumn: value('rel-to-column'),
    cardinality: value('rel-cardinality') as 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many',
    filterDirection: value('rel-direction') as 'single' | 'both',
    active: true
  } });
}

function addMeasure(): void {
  post({ type: 'upsertMeasure', measure: {
    id: crypto.randomUUID(),
    name: value('measure-name'),
    tableId: value('measure-table'),
    expression: value('measure-expression'),
    description: value('measure-description'),
    format: value('measure-format') as 'number' | 'integer' | 'currency' | 'percent' | 'text'
  } });
}

function addVisual(): void {
  if (!state.selectedReportId || !state.selectedPageId) return;
  const columns = value('visual-columns').split(',').map((item) => item.trim()).filter(Boolean);
  const categoryField = value('visual-category');
  const valueField = value('visual-value');
  const measureId = value('visual-measure');
  const visual: Visual = {
    id: crypto.randomUUID(), title: value('visual-title'), type: value('visual-type') as Visual['type'], tableId: value('visual-table'),
    aggregation: value('visual-aggregation') as Visual['aggregation'], columns, limit: Number(value('visual-limit')) || 100, width: 6, height: 4,
    ...(categoryField ? { categoryField } : {}), ...(valueField ? { valueField } : {}), ...(measureId ? { measureId } : {})
  };
  post({ type: 'upsertVisual', reportId: state.selectedReportId, pageId: state.selectedPageId, visual });
}

function deleteVisual(visualId: string): void {
  if (state.selectedReportId && state.selectedPageId) post({ type: 'deleteVisual', reportId: state.selectedReportId, pageId: state.selectedPageId, visualId });
}

function addFilter(): void {
  if (!state.selectedReportId || !state.selectedPageId) return;
  const raw = value('filter-value');
  const secondRaw = value('filter-second');
  post({ type: 'upsertFilter', reportId: state.selectedReportId, pageId: state.selectedPageId, filter: {
    id: crypto.randomUUID(), tableId: value('filter-table'), column: value('filter-column'), operator: value('filter-operator') as FilterOperator,
    value: parseValue(raw), secondValue: parseValue(secondRaw), temporary: false
  } });
}

function deleteFilter(filterId: string): void {
  if (state.selectedReportId && state.selectedPageId) post({ type: 'deleteFilter', reportId: state.selectedReportId, pageId: state.selectedPageId, filterId });
}

function applySlicer(element: HTMLElement): void {
  if (!state.selectedReportId || !state.selectedPageId) return;
  const encodedValue = requiredData(element, 'value');
  post({
    type: 'crossFilter',
    reportId: state.selectedReportId,
    pageId: state.selectedPageId,
    tableId: requiredData(element, 'tableId'),
    column: requiredData(element, 'column'),
    operator: 'eq',
    value: JSON.parse(decodeURIComponent(encodedValue)) as unknown
  });
}

function clearInteractions(): void {
  if (state.selectedReportId && state.selectedPageId) post({ type: 'clearTemporaryFilters', reportId: state.selectedReportId, pageId: state.selectedPageId });
}

function exportReport(): void {
  if (state.selectedReportId && state.selectedPageId) post({ type: 'exportReport', reportId: state.selectedReportId, pageId: state.selectedPageId });
}

function insertField(table: string, column: string): void {
  const editor = document.getElementById('query-sql') as HTMLTextAreaElement | null;
  if (!editor) return;
  const identifier = `"${table.replaceAll('"', '""')}"."${column.replaceAll('"', '""')}"`;
  editor.setRangeText(identifier, editor.selectionStart, editor.selectionEnd, 'end');
  editor.focus();
}

function loadSavedQuery(queryId: string): void {
  const query = state.project?.queries.find((item) => item.id === queryId);
  const editor = document.getElementById('query-sql') as HTMLTextAreaElement | null;
  if (query && editor) editor.value = query.sql;
}

function showToast(level: 'info' | 'warning' | 'error', message: string): void {
  draft.toast = { level, message };
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { draft.toast = undefined; render(); }, 4500);
  render();
}

function value(id: string): string {
  const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  return input?.value.trim() ?? '';
}

function requiredData(element: HTMLElement, key: string): string {
  const value = element.dataset[key];
  if (!value) throw new Error(`Missing UI data attribute ${key}.`);
  return value;
}

function parseValue(raw: string): unknown {
  if (raw === '') return null;
  if (raw.toLowerCase() === 'true') return true;
  if (raw.toLowerCase() === 'false') return false;
  const number = Number(raw);
  return Number.isNaN(number) ? raw : number;
}

function labelForStep(type: TransformationStep['type']): string {
  return ({ select: 'Select columns', rename: 'Rename column', cast: 'Change type', filter: 'Filter rows', fillNull: 'Fill nulls', deduplicate: 'Remove duplicates', sort: 'Sort rows' })[type];
}

post({ type: 'ready' });
