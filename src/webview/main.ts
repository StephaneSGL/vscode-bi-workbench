import './styles.css';
import type { HostMessage, WebviewRequest } from '../shared/messages.js';
import type { ColumnPresentation, FilterOperator, TransformationStep, Visual } from '../shared/project.js';
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
let draggedVisualId: string | undefined;

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
  void handleAction(action ?? '', button).catch((error: unknown) => {
    showToast('error', error instanceof Error ? error.message : String(error));
  });
});

root.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement;
  if (target.id === 'transform-source') draft.transformSourceId = target.value;
  if (target.id === 'rel-from-table') draft.relationshipFromTableId = target.value;
  if (target.id === 'rel-to-table') draft.relationshipToTableId = target.value;
  if (target.id === 'model-table') draft.modelTableId = target.value;
  if (target.id === 'filter-table') draft.filterTableId = target.value;
  if (target.id === 'visual-table') draft.visualTableId = target.value;
  if (['transform-source', 'rel-from-table', 'rel-to-table', 'model-table', 'filter-table', 'visual-table'].includes(target.id)) render();
});

root.addEventListener('dragstart', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.visual-card');
  draggedVisualId = card?.dataset.visualId;
  if (event.dataTransfer && draggedVisualId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedVisualId);
  }
});

root.addEventListener('dragover', (event) => {
  if ((event.target as HTMLElement).closest('.visual-card')) event.preventDefault();
});

root.addEventListener('drop', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.visual-card');
  if (!card || !draggedVisualId || !state.selectedReportId || !state.selectedPageId) return;
  event.preventDefault();
  const toIndex = Number(card.dataset.index ?? '0');
  post({ type: 'reorderVisual', reportId: state.selectedReportId, pageId: state.selectedPageId, visualId: draggedVisualId, toIndex });
  draggedVisualId = undefined;
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
    case 'cancel-query': post({ type: 'cancelQuery' }); break;
    case 'save-query': post({ type: 'saveQuery', name: value('query-name'), sql: value('query-sql') }); break;
    case 'export-query': post({ type: 'exportQuery', format: requiredData(element, 'format') as 'csv' | 'json' }); break;
    case 'insert-field': insertField(requiredData(element, 'table'), requiredData(element, 'column')); break;
    case 'load-query': loadSavedQuery(requiredData(element, 'queryId')); break;
    case 'add-transform-step': addTransformationStep(); break;
    case 'remove-transform-step': draft.transformationSteps.splice(Number(requiredData(element, 'index')), 1); render(); break;
    case 'clear-transform': draft.transformationSteps = []; render(); break;
    case 'apply-transform': applyTransformations(); break;
    case 'add-relationship': addRelationship(element.dataset.id); break;
    case 'edit-relationship': editRelationship(requiredData(element, 'id')); break;
    case 'cancel-relationship-edit':
      draft.editingRelationshipId = undefined;
      draft.relationshipFromTableId = undefined;
      draft.relationshipToTableId = undefined;
      render();
      break;
    case 'delete-relationship': if (window.confirm('Delete this relationship?')) post({ type: 'deleteRelationship', relationshipId: requiredData(element, 'id') }); break;
    case 'save-table-presentation': saveTablePresentation(requiredData(element, 'tableId')); break;
    case 'save-theme': saveTheme(); break;
    case 'add-measure':
    case 'save-measure': saveMeasure(element.dataset.id); break;
    case 'edit-measure': draft.editingMeasureId = requiredData(element, 'id'); render(); break;
    case 'cancel-measure-edit': draft.editingMeasureId = undefined; render(); break;
    case 'delete-measure': if (window.confirm('Delete this measure?')) post({ type: 'deleteMeasure', measureId: requiredData(element, 'id') }); break;
    case 'add-report': post({ type: 'addReport', name: value('new-report-name') || 'New report' }); break;
    case 'add-page': if (state.selectedReportId) post({ type: 'addPage', reportId: state.selectedReportId, name: value('new-page-name') || 'New page' }); break;
    case 'delete-report': if (window.confirm('Delete the selected report?')) post({ type: 'deleteReport', reportId: requiredData(element, 'id') }); break;
    case 'delete-page': if (state.selectedReportId && window.confirm('Delete the selected page?')) post({ type: 'deletePage', reportId: state.selectedReportId, pageId: requiredData(element, 'id') }); break;
    case 'save-report-settings': saveReportSettings(); break;
    case 'save-page-settings': savePageSettings(); break;
    case 'load-page':
      draft.editingVisualId = undefined;
      draft.visualTableId = undefined;
      post({ type: 'loadPage', reportId: requiredData(element, 'reportId'), pageId: requiredData(element, 'pageId') });
      break;
    case 'add-visual':
    case 'save-visual': saveVisual(element.dataset.id); break;
    case 'edit-visual': editVisual(requiredData(element, 'id')); break;
    case 'cancel-visual-edit': draft.editingVisualId = undefined; draft.visualTableId = undefined; render(); break;
    case 'duplicate-visual': duplicateVisual(requiredData(element, 'id')); break;
    case 'move-visual': reorderVisual(requiredData(element, 'id'), Number(requiredData(element, 'index'))); break;
    case 'delete-visual': if (window.confirm('Delete this visual?')) deleteVisual(requiredData(element, 'id')); break;
    case 'add-filter': addFilter(); break;
    case 'delete-filter': deleteFilter(requiredData(element, 'id')); break;
    case 'slicer-select': applySlicer(element); break;
    case 'clear-interactions': clearInteractions(); break;
    case 'export-report': exportReport(); break;
    case 'export-visual': exportVisual(requiredData(element, 'id'), requiredData(element, 'format') as 'csv' | 'json'); break;
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
    case 'replace': step = { ...base, type, column, find: parseValue(parameter), replacement: parseValue(value('transform-second-value')), mode: option === 'substring' ? 'substring' : 'exact' }; break;
    case 'datePart': step = { ...base, type, column, part: option as 'year' | 'quarter' | 'month' | 'week' | 'day' | 'dayOfWeek' | 'hour', newName: parameter }; break;
    case 'group': step = {
      ...base,
      type,
      groupBy: parameter.split(',').map((item) => item.trim()).filter(Boolean),
      aggregations: parseAggregations(value('transform-second-value'))
    }; break;
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

function addRelationship(existingId?: string): void {
  post({ type: 'upsertRelationship', relationship: {
    id: existingId || crypto.randomUUID(),
    fromTableId: value('rel-from-table'),
    fromColumn: value('rel-from-column'),
    toTableId: value('rel-to-table'),
    toColumn: value('rel-to-column'),
    cardinality: value('rel-cardinality') as 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many',
    filterDirection: value('rel-direction') as 'single' | 'both',
    active: checked('rel-active')
  } });
}

function editRelationship(relationshipId: string): void {
  const relationship = state.project?.relationships.find((item) => item.id === relationshipId);
  if (!relationship) return;
  draft.editingRelationshipId = relationshipId;
  draft.relationshipFromTableId = relationship.fromTableId;
  draft.relationshipToTableId = relationship.toTableId;
  render();
}

function saveTablePresentation(tableId: string): void {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('.column-config-row'));
  const columns: ColumnPresentation[] = rows.map((row) => ({
    name: requiredData(row, 'modelColumn'),
    displayName: fieldValue(row, '.column-display-name'),
    description: fieldValue(row, '.column-description'),
    hidden: fieldChecked(row, '.column-hidden'),
    semanticType: fieldValue(row, '.column-semantic-type') as ColumnPresentation['semanticType'],
    format: fieldValue(row, '.column-format') as ColumnPresentation['format']
  }));
  post({
    type: 'updateTablePresentation',
    tableId,
    presentation: { name: value('model-table-name'), description: value('model-table-description'), columns }
  });
}

function saveTheme(): void {
  const palette = value('theme-palette').split(',').map((color) => color.trim()).filter(Boolean);
  post({
    type: 'updateTheme',
    theme: {
      name: value('theme-name'),
      primaryColor: value('theme-primary'),
      backgroundColor: value('theme-background'),
      palette
    }
  });
}

function saveMeasure(existingId?: string): void {
  post({ type: 'upsertMeasure', measure: {
    id: existingId || crypto.randomUUID(),
    name: value('measure-name'),
    tableId: value('measure-table'),
    expression: value('measure-expression'),
    description: value('measure-description'),
    format: value('measure-format') as 'number' | 'integer' | 'currency' | 'percent' | 'text'
  } });
}

function saveReportSettings(): void {
  if (!state.selectedReportId) return;
  post({ type: 'renameReport', reportId: state.selectedReportId, name: value('report-name'), description: value('report-description') });
}

function savePageSettings(): void {
  if (!state.selectedReportId || !state.selectedPageId) return;
  post({ type: 'renamePage', reportId: state.selectedReportId, pageId: state.selectedPageId, name: value('page-name'), description: value('page-description') });
}

function saveVisual(existingId?: string): void {
  if (!state.selectedReportId || !state.selectedPageId) return;
  const checkedColumns = Array.from(root.querySelectorAll<HTMLInputElement>('.visual-column:checked')).map((input) => input.value);
  const requestedOrder = value('visual-column-order').split(',').map((item) => item.trim()).filter(Boolean);
  const columns = [
    ...requestedOrder.filter((column, index) => checkedColumns.includes(column) && requestedOrder.indexOf(column) === index),
    ...checkedColumns.filter((column) => !requestedOrder.includes(column))
  ];
  const categoryField = value('visual-category');
  const seriesField = value('visual-series');
  const valueField = value('visual-value');
  const measureId = value('visual-measure');
  const sortField = value('visual-sort-field');
  const customColor = checked('visual-custom-color');
  const customBackground = checked('visual-custom-background');
  const visual: Visual = {
    id: existingId || crypto.randomUUID(),
    title: value('visual-title'),
    description: value('visual-description'),
    type: value('visual-type') as Visual['type'],
    tableId: value('visual-table'),
    aggregation: value('visual-aggregation') as Visual['aggregation'],
    columns,
    limit: numericValue('visual-limit', 100),
    width: numericValue('visual-width', 6),
    height: numericValue('visual-height', 4),
    sortBy: value('visual-sort-by') as Visual['sortBy'],
    sortDirection: value('visual-sort-direction') as Visual['sortDirection'],
    showLegend: checked('visual-show-legend'),
    legendPosition: value('visual-legend-position') as Visual['legendPosition'],
    showLabels: checked('visual-show-labels'),
    smooth: checked('visual-smooth'),
    numberFormat: value('visual-number-format') as Visual['numberFormat'],
    currency: value('visual-currency').toUpperCase(),
    decimals: numericValue('visual-decimals', 2),
    interactionMode: value('visual-interaction') as Visual['interactionMode'],
    ...(categoryField ? { categoryField } : {}),
    ...(seriesField ? { seriesField } : {}),
    ...(valueField ? { valueField } : {}),
    ...(measureId ? { measureId } : {}),
    ...(sortField ? { sortField } : {}),
    ...(customColor ? { color: value('visual-color') } : {}),
    ...(customBackground ? { backgroundColor: value('visual-background') } : {})
  };
  post({ type: 'upsertVisual', reportId: state.selectedReportId, pageId: state.selectedPageId, visual });
}

function editVisual(visualId: string): void {
  const report = state.project?.reports.find((item) => item.id === state.selectedReportId);
  const page = report?.pages.find((item) => item.id === state.selectedPageId);
  const visual = page?.visuals.find((item) => item.id === visualId);
  if (!visual) return;
  draft.editingVisualId = visualId;
  draft.visualTableId = visual.tableId;
  render();
  document.querySelector('.builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function duplicateVisual(visualId: string): void {
  if (state.selectedReportId && state.selectedPageId) {
    post({ type: 'duplicateVisual', reportId: state.selectedReportId, pageId: state.selectedPageId, visualId });
  }
}

function reorderVisual(visualId: string, toIndex: number): void {
  if (state.selectedReportId && state.selectedPageId) {
    post({ type: 'reorderVisual', reportId: state.selectedReportId, pageId: state.selectedPageId, visualId, toIndex });
  }
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

function exportVisual(visualId: string, format: 'csv' | 'json'): void {
  if (state.selectedReportId && state.selectedPageId) {
    post({ type: 'exportVisual', reportId: state.selectedReportId, pageId: state.selectedPageId, visualId, format });
  }
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

function checked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
}

function numericValue(id: string, fallback: number): number {
  const parsed = Number(value(id));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fieldValue(parent: HTMLElement, selector: string): string {
  return (parent.querySelector(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value.trim() ?? '';
}

function fieldChecked(parent: HTMLElement, selector: string): boolean {
  return (parent.querySelector(selector) as HTMLInputElement | null)?.checked ?? false;
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
  return ({ select: 'Select columns', rename: 'Rename column', cast: 'Change type', filter: 'Filter rows', fillNull: 'Fill nulls', deduplicate: 'Remove duplicates', sort: 'Sort rows', replace: 'Replace values', datePart: 'Extract date part', group: 'Group and aggregate' })[type];
}

function parseAggregations(raw: string): Extract<TransformationStep, { type: 'group' }>['aggregations'] {
  return raw.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
    const [operation, column, name] = item.split(':').map((part) => part.trim());
    if (!operation || !column || !name || !['count', 'countDistinct', 'sum', 'avg', 'min', 'max'].includes(operation)) {
      throw new Error(`Invalid aggregation "${item}". Use function:column:name.`);
    }
    return {
      function: operation as Extract<TransformationStep, { type: 'group' }>['aggregations'][number]['function'],
      column,
      name
    };
  });
}

post({ type: 'ready' });
