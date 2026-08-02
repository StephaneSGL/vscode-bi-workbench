import { DEFAULT_PROJECT_THEME, type BiProject, type ColumnProfile, type QueryResult, type ReportPage, type TableModel, type TransformationStep, type Visual, type VisualData } from '../shared/project.js';
import type { WorkbenchSection, WorkbenchState } from '../shared/state.js';

export interface UiDraft {
  transformationSteps: TransformationStep[];
  transformSourceId?: string;
  relationshipFromTableId?: string;
  relationshipToTableId?: string;
  editingRelationshipId?: string;
  modelTableId?: string;
  filterTableId?: string;
  visualTableId?: string;
  editingMeasureId?: string;
  editingVisualId?: string;
  busy?: string;
  toast?: { level: 'info' | 'warning' | 'error'; message: string };
}

const NAVIGATION: { id: WorkbenchSection; label: string; icon: string }[] = [
  { id: 'reports', label: 'Report', icon: '▥' },
  { id: 'data', label: 'Data', icon: '▦' },
  { id: 'model', label: 'Model', icon: '⋈' },
  { id: 'query', label: 'Query', icon: '›_' },
  { id: 'transform', label: 'Transform', icon: '↻' },
  { id: 'import', label: 'Import', icon: '↓' },
  { id: 'measures', label: 'Measures', icon: '∑' },
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'help', label: 'Help', icon: '?' }
];

export function renderApp(state: WorkbenchState, draft: UiDraft): string {
  const projectName = state.project?.name ?? 'No project open';
  return `
    <div class="workbench-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true">▥</span><div><strong>BI Workbench</strong><small>Analytics Studio</small></div></div>
        <div class="project-status"><span class="privacy-dot"></span><span>${escapeHtml(projectName)}</span>${state.dirty ? '<span class="dirty">Unsaved</span>' : state.project ? '<span class="saved">Saved</span>' : ''}</div>
        <div class="top-actions">
          <button class="secondary" data-action="create-project">New</button>
          <button class="secondary" data-action="open-project">Open</button>
          <button class="primary" data-action="save-project" ${state.project ? '' : 'disabled'}>Save</button>
        </div>
      </header>
      ${renderRibbon(state)}
      <aside class="sidebar" aria-label="BI Workbench navigation">
        <nav>${NAVIGATION.map((item) => `<button class="nav-item ${state.activeSection === item.id ? 'active' : ''}" data-action="navigate" data-section="${item.id}" title="${item.label}"><span class="nav-icon" aria-hidden="true">${item.icon}</span><span class="nav-label">${item.label}</span></button>`).join('')}</nav>
        <div class="sidebar-footer"><span>DuckDB ${escapeHtml(state.engineVersion ?? 'not started')}</span><span>Data remains local by default</span></div>
      </aside>
      <main class="content">
        ${state.error ? `<div class="error-banner"><strong>Operation failed</strong><span>${escapeHtml(state.error)}</span><button data-action="show-logs">Open logs</button></div>` : ''}
        ${renderSection(state, draft)}
      </main>
      ${draft.busy ? `<div class="busy" role="status"><span class="spinner"></span>${escapeHtml(draft.busy)}${draft.busy === 'Run query' ? '<button class="secondary" data-action="cancel-query">Cancel query</button>' : ''}</div>` : ''}
      ${draft.toast ? `<div class="toast ${draft.toast.level}" role="status">${escapeHtml(draft.toast.message)}</div>` : ''}
    </div>`;
}

function renderRibbon(state: WorkbenchState): string {
  const disabled = state.project ? '' : 'disabled';
  return `<div class="ribbon" role="toolbar" aria-label="BI authoring commands">
    <div class="ribbon-tabs"><span class="active">Home</span><span>Insert</span><span>Modeling</span><span>View</span><span>Help</span></div>
    <div class="ribbon-commands">
      <div class="ribbon-group"><button data-action="import-data" ${disabled}><b>↓</b><span>Get data</span></button><button data-action="navigate" data-section="data" ${disabled}><b>▦</b><span>Preview</span></button><small>Data</small></div>
      <div class="ribbon-group"><button data-action="navigate" data-section="transform" ${disabled}><b>↻</b><span>Transform</span></button><button data-action="navigate" data-section="query" ${disabled}><b>›_</b><span>SQL query</span></button><small>Queries</small></div>
      <div class="ribbon-group"><button data-action="navigate" data-section="reports" ${disabled}><b>▥</b><span>New visual</span></button><button data-action="navigate" data-section="measures" ${disabled}><b>∑</b><span>Measure</span></button><small>Insert</small></div>
      <div class="ribbon-group"><button data-action="navigate" data-section="model" ${disabled}><b>⋈</b><span>Relationships</span></button><button data-action="export-powerbi" ${disabled}><b>PB</b><span>Power BI</span></button><small>Model & export</small></div>
      <div class="ribbon-group copilot-group"><button data-action="open-copilot" ${disabled}><b>AI</b><span>Copilot @bi</span></button><small>Assistant</small></div>
    </div>
  </div>`;
}

function renderSection(state: WorkbenchState, draft: UiDraft): string {
  switch (state.activeSection) {
    case 'home': return renderHome(state);
    case 'import': return renderImport(state);
    case 'data': return renderData(state);
    case 'query': return renderQuery(state);
    case 'transform': return renderTransform(state, draft);
    case 'model': return renderModel(state, draft);
    case 'measures': return renderMeasures(state, draft);
    case 'reports': return renderReports(state, draft);
    case 'settings': return renderSettings(state);
    case 'help': return renderHelp();
  }
}

function renderHome(state: WorkbenchState): string {
  if (!state.project) {
    return `<section class="empty-home"><div class="hero-mark">▥</div><p class="eyebrow">BUSINESS INTELLIGENCE, INSIDE YOUR EDITOR</p><h1>Build a real local data project.</h1><p>Import files and databases, run DuckDB SQL, define a semantic model, create interactive reports, and ask GitHub Copilot through <code>@bi</code>.</p><div class="hero-actions"><button class="primary large" data-action="create-project">Create a project</button><button class="secondary large" data-action="open-project">Open a project</button></div>${renderRecent(state.recentProjects)}</section>`;
  }
  const project = state.project;
  const rowCount = project.tables.reduce((sum, table) => sum + table.rowCount, 0);
  return `<section><div class="section-heading"><div><p class="eyebrow">PROJECT OVERVIEW</p><h1>${escapeHtml(project.name)}</h1><p>${escapeHtml(project.description || 'Local-first analytical project')}</p></div><button class="primary" data-action="import-data">Import data</button></div>
  <div class="metric-grid"><article class="metric"><span>Tables</span><strong>${project.tables.length}</strong><small>${formatNumber(rowCount)} total rows</small></article><article class="metric"><span>Relationships</span><strong>${project.relationships.length}</strong><small>semantic links</small></article><article class="metric"><span>Measures</span><strong>${project.measures.length}</strong><small>reusable calculations</small></article><article class="metric"><span>Reports</span><strong>${project.reports.length}</strong><small>${project.reports.reduce((sum, report) => sum + report.pages.length, 0)} pages</small></article></div>
  <h2>Continue working</h2><div class="quick-grid"><button class="quick" data-action="navigate" data-section="import"><b>01</b><span><strong>Import data</strong><small>CSV, JSON, XLSX, Parquet, DuckDB</small></span></button><button class="quick" data-action="navigate" data-section="query"><b>02</b><span><strong>Run SQL</strong><small>Bounded read-only DuckDB queries</small></span></button><button class="quick" data-action="navigate" data-section="model"><b>03</b><span><strong>Build the model</strong><small>Relationships and measures</small></span></button><button class="quick" data-action="navigate" data-section="reports"><b>04</b><span><strong>Create a report</strong><small>Interactive charts and filters</small></span></button><button class="quick" data-action="export-powerbi"><b>05</b><span><strong>Export to Power BI</strong><small>PBIP, PBIR, TMDL and complete CSV data</small></span></button></div>
  <div class="copilot-callout"><span class="callout-mark">@bi</span><div><strong>GitHub Copilot is project-aware</strong><p>Open Chat and use <code>@bi /sql</code>, <code>/analyze</code>, <code>/report</code>, <code>/visual</code>, or <code>/powerbi</code>. Schema-only sharing is the default.</p></div></div></section>`;
}

function renderRecent(recent: readonly string[]): string {
  if (recent.length === 0) return '';
  return `<div class="recent"><h2>Recent projects</h2>${recent.slice(0, 5).map((item) => `<div class="recent-item"><span>${escapeHtml(item)}</span></div>`).join('')}</div>`;
}

function renderImport(state: WorkbenchState): string {
  return `<section>${sectionHeading('Import data', 'Bulk import into the project DuckDB database. Original files are never modified.', '<button class="primary" data-action="import-data" '+(state.project ? '' : 'disabled')+'>Choose files</button>')}
  ${!state.project ? noProject() : `<div class="connector-grid">${connector('CSV / TSV', 'Type inference, headers, strict parsing', 'Ready')}${connector('JSON / JSONL', 'Objects and newline-delimited records', 'Ready')}${connector('Excel XLSX', 'All non-empty worksheets, offline parser', 'Ready')}${connector('Parquet', 'Columnar bulk import', 'Ready')}${connector('DuckDB', 'Copy all base tables from a local database', 'Ready')}${connector('SQLite', 'Portable read-only copy; .db files are detected by header', 'Ready')}${connector('PostgreSQL / MySQL / ODBC', 'Credential-safe server connectors and cancellation', 'Planned', true)}</div><div class="info-panel"><strong>Import behavior</strong><ul><li>Data is copied into <code>.bi-workbench/data.duckdb</code>.</li><li>Names are normalized and made unique; display names are preserved.</li><li>Any failure rolls back the active import transaction.</li><li>SQLite files are never modified and are limited to 512 MiB by the portable reader.</li><li>The generated data directory is ignored by Git by default.</li></ul></div>`}</section>`;
}

function connector(title: string, description: string, status: string, disabled = false): string {
  return `<article class="connector ${disabled ? 'disabled' : ''}"><div class="connector-icon">${disabled ? '○' : '●'}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p><span class="badge">${escapeHtml(status)}</span></article>`;
}

function renderData(state: WorkbenchState): string {
  if (!state.project) return `<section>${sectionHeading('Data preview', 'Inspect imported data and column quality.')}${noProject()}</section>`;
  if (state.project.tables.length === 0) return `<section>${sectionHeading('Data preview', 'Inspect imported data and column quality.', '<button class="primary" data-action="import-data">Import data</button>')}${emptyState('No tables yet', 'Import a supported data file to create the first table.')}</section>`;
  const tableId = state.selectedTableId ?? state.project.tables[0]?.id ?? '';
  const table = state.project.tables.find((item) => item.id === tableId) ?? state.project.tables[0];
  return `<section>${sectionHeading('Data preview', 'Bounded grid and locally computed column profiles.', `<div class="heading-actions"><button class="secondary" data-action="profile-table" data-table-id="${escapeAttribute(table?.id ?? '')}">Profile columns</button><button class="primary" data-action="preview-table" data-table-id="${escapeAttribute(table?.id ?? '')}">Refresh preview</button></div>`)}
  <div class="table-tabs">${state.project.tables.map((item) => `<button class="table-tab ${item.id === table?.id ? 'active' : ''}" data-action="preview-table" data-table-id="${escapeAttribute(item.id)}"><span>${escapeHtml(item.name)}</span><small>${formatNumber(item.rowCount)} rows</small></button>`).join('')}</div>
  ${table ? `<div class="schema-strip">${table.columns.map((column) => `<span><b>${escapeHtml(column.name)}</b><small>${escapeHtml(column.dataType)}</small></span>`).join('')}</div>` : ''}
  ${state.profiles && state.selectedTableId === table?.id ? renderProfiles(state.profiles) : ''}
  ${state.preview ? renderResultGrid(state.preview) : emptyState('Preview not loaded', 'Select a table or click Refresh preview.')}</section>`;
}

function renderProfiles(profiles: readonly ColumnProfile[]): string {
  return `<details class="profiles" open><summary>Column profile (${profiles.length})</summary><div class="profile-grid">${profiles.map((profile) => `<article><strong>${escapeHtml(profile.column.name)}</strong><small>${escapeHtml(profile.column.dataType)}</small><dl><div><dt>Null</dt><dd>${formatNumber(profile.nullCount)}</dd></div><div><dt>Distinct</dt><dd>${formatNumber(profile.distinctCount)}</dd></div><div><dt>Min</dt><dd>${escapeHtml(String(profile.minimum ?? '—'))}</dd></div><div><dt>Max</dt><dd>${escapeHtml(String(profile.maximum ?? '—'))}</dd></div>${profile.average === undefined ? '' : `<div><dt>Average</dt><dd>${formatNumber(profile.average)}</dd></div>`}</dl></article>`).join('')}</div></details>`;
}

function renderQuery(state: WorkbenchState): string {
  const savedQueries = state.project?.queries ?? [];
  return `<section>${sectionHeading('Query editor', 'One bounded, read-only DuckDB SELECT or WITH statement.', `<div class="heading-actions"><button class="secondary" data-action="save-query" ${state.project ? '' : 'disabled'}>Save query</button><button class="primary" data-action="run-query" ${state.project ? '' : 'disabled'}>Run query</button></div>`)}
  ${!state.project ? noProject() : `<div class="query-layout"><aside class="schema-browser"><h3>Schema</h3>${state.project.tables.map((table) => `<details open><summary>${escapeHtml(table.name)}</summary>${table.columns.map((column) => `<button data-action="insert-field" data-table="${escapeAttribute(table.physicalName)}" data-column="${escapeAttribute(column.name)}"><span>${escapeHtml(column.name)}</span><small>${escapeHtml(column.dataType)}</small></button>`).join('')}</details>`).join('')}<h3>Saved</h3>${savedQueries.map((query) => `<button data-action="load-query" data-query-id="${escapeAttribute(query.id)}">${escapeHtml(query.name)}</button>`).join('')}</aside><div class="query-main"><label class="field"><span>DuckDB SQL</span><textarea id="query-sql" class="sql-editor" spellcheck="false">${escapeHtml(state.querySql)}</textarea></label><div class="query-toolbar"><label>Query name <input id="query-name" value="Analysis ${savedQueries.length + 1}"></label><span class="spacer"></span><button class="secondary" data-action="export-query" data-format="csv" ${state.queryResult ? '' : 'disabled'}>Export CSV</button><button class="secondary" data-action="export-query" data-format="json" ${state.queryResult ? '' : 'disabled'}>Export JSON</button></div>${state.queryResult ? `<div class="result-meta"><span>${formatNumber(state.queryResult.rowCount)} rows${state.queryResult.truncated ? ' (limited)' : ''}</span><span>${state.queryResult.durationMs.toFixed(2)} ms</span></div>${renderResultGrid(state.queryResult)}` : emptyState('No result', 'Run a query to display its bounded result.')}</div></div>`}</section>`;
}

function renderTransform(state: WorkbenchState, draft: UiDraft): string {
  if (!state.project) return `<section>${sectionHeading('Transform data', 'Create repeatable derived tables.')}${noProject()}</section>`;
  if (state.project.tables.length === 0) return `<section>${sectionHeading('Transform data', 'Create repeatable derived tables.')}${emptyState('No source table', 'Import data first.')}</section>`;
  const sourceId = draft.transformSourceId ?? state.selectedTableId ?? state.project.tables[0]?.id ?? '';
  const source = state.project.tables.find((table) => table.id === sourceId) ?? state.project.tables[0];
  return `<section>${sectionHeading('Transform data', 'Steps compile to deterministic SQL and run in one transaction.')}
  <div class="split"><div class="panel"><h2>Pipeline</h2><label class="field"><span>Source table</span><select id="transform-source">${tableOptions(state.project, source?.id)}</select></label><label class="field"><span>Derived table name</span><input id="transform-target" value="${escapeAttribute(source ? `${source.name} Clean` : 'Clean table')}"></label><div class="step-list">${draft.transformationSteps.length ? draft.transformationSteps.map((step, index) => `<div class="step"><b>${index + 1}</b><span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(describeStep(step))}</small></span><button class="icon-button" data-action="remove-transform-step" data-index="${index}" aria-label="Remove step">×</button></div>`).join('') : '<p class="muted">No steps added.</p>'}</div><div class="panel-actions"><button class="secondary" data-action="clear-transform">Clear</button><button class="primary" data-action="apply-transform" ${draft.transformationSteps.length ? '' : 'disabled'}>Create derived table</button></div></div>
  <div class="panel"><h2>Add a step</h2><label class="field"><span>Operation</span><select id="transform-type"><option value="filter">Filter rows</option><option value="select">Select columns</option><option value="rename">Rename column</option><option value="cast">Change type</option><option value="fillNull">Fill null values</option><option value="replace">Replace values</option><option value="datePart">Extract date part</option><option value="group">Group and aggregate</option><option value="deduplicate">Remove duplicates</option><option value="sort">Sort rows</option></select></label><label class="field"><span>Column</span><select id="transform-column">${columnOptions(source)}</select></label><label class="field"><span>Operator / type / direction / date part</span><select id="transform-operator"><option value="eq">equals / exact</option><option value="substring">substring</option><option value="neq">not equals</option><option value="contains">contains</option><option value="gt">greater than</option><option value="gte">greater or equal</option><option value="lt">less than</option><option value="lte">less or equal</option><option value="between">between</option><option value="VARCHAR">VARCHAR</option><option value="BIGINT">BIGINT</option><option value="DOUBLE">DOUBLE</option><option value="BOOLEAN">BOOLEAN</option><option value="DATE">DATE</option><option value="TIMESTAMP">TIMESTAMP</option><option value="asc">ascending</option><option value="desc">descending</option><option value="year">year</option><option value="quarter">quarter</option><option value="month">month</option><option value="week">week</option><option value="day">day</option><option value="dayOfWeek">day of week</option><option value="hour">hour</option></select></label><label class="field"><span>Value / new name / group columns</span><input id="transform-value" placeholder="France, new_name, or region,product"></label><label class="field"><span>Second value / aggregations</span><input id="transform-second-value" placeholder="Replacement or sum:amount:revenue"></label><button class="primary full" data-action="add-transform-step">Add step</button><div class="sql-preview"><small>Group syntax</small><code>group columns: region,product · aggregations: sum:amount:revenue, count:id:rows</code><small>Execution model</small><code>source → ordered CTE steps → new DuckDB table</code></div></div></div></section>`;
}

function renderModel(state: WorkbenchState, draft: UiDraft): string {
  if (!state.project) return `<section>${sectionHeading('Semantic model', 'Define validated relationships between tables.')}${noProject()}</section>`;
  const project = state.project;
  if (project.tables.length === 0) return `<section>${sectionHeading('Semantic model', 'Configure tables, columns, and relationships.')}${emptyState('No tables', 'Import data before configuring the semantic model.')}</section>`;
  const editingRelationship = project.relationships.find((relationship) => relationship.id === draft.editingRelationshipId);
  const requestedFromId = draft.relationshipFromTableId ?? editingRelationship?.fromTableId ?? project.tables[0]?.id;
  const requestedToId = draft.relationshipToTableId ?? editingRelationship?.toTableId ?? project.tables[1]?.id ?? project.tables[0]?.id;
  const from = project.tables.find((table) => table.id === requestedFromId) ?? project.tables[0];
  const to = project.tables.find((table) => table.id === requestedToId) ?? project.tables[1] ?? project.tables[0];
  const fromId = from?.id;
  const toId = to?.id;
  const modelTableId = draft.modelTableId ?? project.tables[0]?.id;
  const modelTable = project.tables.find((table) => table.id === modelTableId) ?? project.tables[0];
  return `<section>${sectionHeading('Semantic model', 'Configure business names, formats, hidden fields, and validated relationships.')}
  <div class="panel model-editor"><div class="panel-title-row"><h2>Table and column configuration</h2><select id="model-table">${tableOptions(project, modelTable?.id)}</select></div>
  <div class="form-grid"><label class="field"><span>Table display name</span><input id="model-table-name" value="${escapeAttribute(modelTable?.name ?? '')}"></label><label class="field"><span>Description</span><input id="model-table-description" value="${escapeAttribute(modelTable?.description ?? '')}" placeholder="Business meaning and usage"></label></div>
  <div class="column-config"><div class="column-config-head"><span>Physical column</span><span>Display name</span><span>Semantic type</span><span>Format</span><span>Hidden</span></div>${modelTable?.columns.map((column) => `<div class="column-config-row" data-model-column="${escapeAttribute(column.name)}"><span><strong>${escapeHtml(column.name)}</strong><small>${escapeHtml(column.dataType)}</small></span><label><input class="column-display-name" value="${escapeAttribute(column.displayName ?? column.name)}"><input class="column-description" value="${escapeAttribute(column.description ?? '')}" placeholder="Description"></label><select class="column-semantic-type">${selectOptions(['auto', 'category', 'measure', 'date', 'geography', 'identifier'], column.semanticType ?? 'auto')}</select><select class="column-format">${selectOptions(['auto', 'number', 'integer', 'currency', 'percent', 'date', 'datetime', 'text'], column.format ?? 'auto')}</select><label class="check"><input class="column-hidden" type="checkbox" ${column.hidden ? 'checked' : ''}> Hide</label></div>`).join('') ?? ''}</div>
  <div class="panel-actions"><span class="muted">Physical names stay unchanged so saved SQL remains valid.</span><button class="primary" data-action="save-table-presentation" data-table-id="${escapeAttribute(modelTable?.id ?? '')}">Save table configuration</button></div></div>
  <div class="model-summary">${project.tables.map((table) => `<article><header><strong>${escapeHtml(table.name)}</strong><span>${table.kind}</span></header>${table.columns.filter((column) => !column.hidden).map((column) => `<div><span>${escapeHtml(column.displayName ?? column.name)}</span><small>${escapeHtml(column.dataType)}</small></div>`).join('')}</article>`).join('')}</div>
  <div class="split"><div class="panel"><h2>Relationships</h2>${project.relationships.length ? project.relationships.map((relationship) => `<div class="relationship ${editingRelationship?.id === relationship.id ? 'selected' : ''}"><span><b>${escapeHtml(tableName(project, relationship.fromTableId))}.${escapeHtml(columnDisplayName(project, relationship.fromTableId, relationship.fromColumn))}</b><small>${escapeHtml(relationship.cardinality)} · ${escapeHtml(relationship.filterDirection)} · ${relationship.active ? 'active' : 'inactive'}</small><b>${escapeHtml(tableName(project, relationship.toTableId))}.${escapeHtml(columnDisplayName(project, relationship.toTableId, relationship.toColumn))}</b></span><div class="row-actions"><button data-action="edit-relationship" data-id="${escapeAttribute(relationship.id)}">Edit</button><button class="icon-button" data-action="delete-relationship" data-id="${escapeAttribute(relationship.id)}">×</button></div></div>`).join('') : '<p class="muted">No relationships defined.</p>'}</div><div class="panel"><h2>${editingRelationship ? 'Edit relationship' : 'Add relationship'}</h2><div class="form-grid"><label class="field"><span>From table</span><select id="rel-from-table">${tableOptions(project, fromId)}</select></label><label class="field"><span>From column</span><select id="rel-from-column">${columnOptions(from, editingRelationship?.fromColumn)}</select></label><label class="field"><span>To table</span><select id="rel-to-table">${tableOptions(project, toId)}</select></label><label class="field"><span>To column</span><select id="rel-to-column">${columnOptions(to, editingRelationship?.toColumn)}</select></label><label class="field"><span>Cardinality</span><select id="rel-cardinality">${selectOptions(['many-to-one', 'one-to-many', 'one-to-one', 'many-to-many'], editingRelationship?.cardinality ?? 'many-to-one')}</select></label><label class="field"><span>Filter direction</span><select id="rel-direction">${selectOptions(['single', 'both'], editingRelationship?.filterDirection ?? 'single')}</select></label><label class="check"><input id="rel-active" type="checkbox" ${editingRelationship?.active ?? true ? 'checked' : ''}> Active for filter propagation</label></div><div class="panel-actions">${editingRelationship ? '<button class="secondary" data-action="cancel-relationship-edit">Cancel</button>' : ''}<button class="primary" data-action="add-relationship" data-id="${escapeAttribute(editingRelationship?.id ?? '')}">Validate and save</button></div></div></div></section>`;
}

function renderMeasures(state: WorkbenchState, draft: UiDraft): string {
  if (!state.project) return `<section>${sectionHeading('Measures', 'Reusable SQL aggregate calculations.')}${noProject()}</section>`;
  const project = state.project;
  const editing = project.measures.find((measure) => measure.id === draft.editingMeasureId);
  return `<section>${sectionHeading('Measures', 'Expressions are validated against DuckDB. This is not DAX compatibility.')}
  <div class="split"><div class="panel"><h2>Defined measures</h2>${project.measures.length ? project.measures.map((measure) => `<div class="measure ${editing?.id === measure.id ? 'selected' : ''}"><span><strong>${escapeHtml(measure.name)}</strong><code>${escapeHtml(measure.expression)}</code><small>${escapeHtml(tableName(project, measure.tableId))} · ${escapeHtml(measure.format)}</small></span><div class="row-actions"><button data-action="edit-measure" data-id="${escapeAttribute(measure.id)}">Edit</button><button class="icon-button" data-action="delete-measure" data-id="${escapeAttribute(measure.id)}">×</button></div></div>`).join('') : '<p class="muted">No measures defined.</p>'}</div><div class="panel"><h2>${editing ? 'Edit measure' : 'New measure'}</h2><label class="field"><span>Name</span><input id="measure-name" value="${escapeAttribute(editing?.name ?? 'Total')}"></label><label class="field"><span>Home table</span><select id="measure-table">${tableOptions(project, editing?.tableId)}</select></label><label class="field"><span>Aggregate SQL expression</span><textarea id="measure-expression" class="small-code">${escapeHtml(editing?.expression ?? 'SUM("amount")')}</textarea></label><label class="field"><span>Format</span><select id="measure-format">${selectOptions(['number', 'integer', 'currency', 'percent', 'text'], editing?.format ?? 'number')}</select></label><label class="field"><span>Description</span><input id="measure-description" value="${escapeAttribute(editing?.description ?? '')}" placeholder="Optional business definition"></label><div class="panel-actions">${editing ? '<button class="secondary" data-action="cancel-measure-edit">Cancel</button>' : ''}<button class="primary" data-action="save-measure" data-id="${escapeAttribute(editing?.id ?? '')}" ${project.tables.length ? '' : 'disabled'}>Validate and save</button></div></div></div></section>`;
}

function renderReports(state: WorkbenchState, draft: UiDraft): string {
  if (!state.project) return `<section>${sectionHeading('Reports', 'Interactive dashboard pages backed by real queries.')}${noProject()}</section>`;
  const project = state.project;
  const theme = project.theme ?? DEFAULT_PROJECT_THEME;
  const report = project.reports.find((item) => item.id === state.selectedReportId) ?? project.reports[0];
  const page = report?.pages.find((item) => item.id === state.selectedPageId) ?? report?.pages[0];
  if (!report || !page) return `<section>${emptyState('No report page', 'Create a report to continue.')}</section>`;
  const requestedFilterTableId = draft.filterTableId ?? project.tables[0]?.id;
  const filterTable = project.tables.find((table) => table.id === requestedFilterTableId) ?? project.tables[0];
  const filterTableId = filterTable?.id;
  const editingVisual = page.visuals.find((visual) => visual.id === draft.editingVisualId);
  const requestedVisualTableId = draft.visualTableId ?? editingVisual?.tableId ?? project.tables[0]?.id;
  const visualTable = project.tables.find((table) => table.id === requestedVisualTableId) ?? project.tables[0];
  const visualTableId = visualTable?.id;
  return `<section class="reports-section">${sectionHeading('Report canvas', 'Build interactive pages with a familiar report, data, model and visual workflow.', `<div class="heading-actions"><button class="secondary" data-action="clear-interactions">Clear filters</button><button class="secondary" data-action="export-report">Export HTML</button><button class="primary" data-action="export-powerbi">Export Power BI</button></div>`)}
  <div class="report-toolbar"><div class="report-tabs"><span class="toolbar-label">Reports</span>${project.reports.map((item) => `<button class="${item.id === report.id ? 'active' : ''}" data-action="load-page" data-report-id="${escapeAttribute(item.id)}" data-page-id="${escapeAttribute(item.pages[0]?.id ?? '')}">${escapeHtml(item.name)}</button>`).join('')}<button class="icon-button" data-action="delete-report" data-id="${escapeAttribute(report.id)}" aria-label="Delete selected report" ${project.reports.length > 1 ? '' : 'disabled'}>×</button><input id="new-report-name" placeholder="New report"><button data-action="add-report" aria-label="Add report">+</button></div></div>
  <div class="report-studio">
    <div class="report-stage">
      <div class="canvas-titlebar"><div><strong>${escapeHtml(page.name)}</strong><span>${escapeHtml(report.name)}</span></div><div class="canvas-filter-summary"><span>Filters</span>${page.filters.map((filter) => `<span class="filter-chip ${filter.temporary ? 'temporary' : ''}">${escapeHtml(columnDisplayName(project, filter.tableId, filter.column))}: ${escapeHtml(String(filter.value ?? filter.operator))}</span>`).join('') || '<span class="muted">All data</span>'}</div></div>
      <div class="report-canvas"><div class="dashboard-grid" style="background:${escapeAttribute(theme.backgroundColor ?? 'transparent')}">${page.visuals.length ? page.visuals.map((visual, index) => renderVisualCard(visual, state.visualData.find((item) => item.visualId === visual.id), project, index, page.visuals.length)).join('') : `<div class="dashboard-empty">${emptyState('Blank report page', 'Use the Visualizations pane to add a real chart.')}</div>`}</div></div>
      <div class="page-tabs"><span class="page-nav-mark">‹</span>${report.pages.map((item) => `<button class="${item.id === page.id ? 'active' : ''}" data-action="load-page" data-report-id="${escapeAttribute(report.id)}" data-page-id="${escapeAttribute(item.id)}">${escapeHtml(item.name)}</button>`).join('')}<button class="icon-button" data-action="delete-page" data-id="${escapeAttribute(page.id)}" aria-label="Delete selected page" ${report.pages.length > 1 ? '' : 'disabled'}>×</button><input id="new-page-name" placeholder="New page"><button class="page-add" data-action="add-page" aria-label="Add page">+</button></div>
    </div>
    <aside class="report-inspector" aria-label="Report configuration panes">
      <details class="inspector-pane filters-pane" open><summary><span>Filters</span><b>${page.filters.length}</b></summary><div class="inspector-body"><div class="active-filter-list">${page.filters.map((filter) => `<span class="filter-chip ${filter.temporary ? 'temporary' : ''}">${escapeHtml(tableName(project, filter.tableId))}.${escapeHtml(filter.column)} ${escapeHtml(filter.operator)} ${escapeHtml(String(filter.value ?? ''))}<button data-action="delete-filter" data-id="${escapeAttribute(filter.id)}">×</button></span>`).join('') || '<span class="muted">No page filter</span>'}</div><label class="field"><span>Table</span><select id="filter-table">${tableOptions(project, filterTableId)}</select></label><label class="field"><span>Field</span><select id="filter-column">${columnOptions(filterTable)}</select></label><label class="field"><span>Condition</span><select id="filter-operator"><option value="eq">equals</option><option value="neq">not equal</option><option value="contains">contains</option><option value="gt">greater than</option><option value="gte">greater or equal</option><option value="lt">less than</option><option value="lte">less or equal</option><option value="between">between</option><option value="isNull">is null</option><option value="isNotNull">is not null</option></select></label><label class="field"><span>Value</span><input id="filter-value" placeholder="Value"></label><label class="field"><span>Second value</span><input id="filter-second" placeholder="Optional"></label><button class="primary full" data-action="add-filter">Apply filter</button></div></details>
      ${renderVisualBuilder(project, visualTable, visualTableId, editingVisual)}
      ${renderFieldsPane(project)}
      <details class="inspector-pane report-settings"><summary>Page settings</summary><div class="inspector-body"><label class="field"><span>Report name</span><input id="report-name" value="${escapeAttribute(report.name)}"></label><label class="field"><span>Report description</span><input id="report-description" value="${escapeAttribute(report.description ?? '')}"></label><button data-action="save-report-settings">Save report</button><label class="field"><span>Page name</span><input id="page-name" value="${escapeAttribute(page.name)}"></label><label class="field"><span>Page description</span><input id="page-description" value="${escapeAttribute(page.description ?? '')}"></label><button data-action="save-page-settings">Save page</button></div></details>
    </aside>
  </div></section>`;
}

function renderFieldsPane(project: BiProject): string {
  return `<details class="inspector-pane fields-pane" open><summary><span>Data</span><b>${project.tables.length}</b></summary><div class="inspector-body field-tree">${project.tables.map((table) => `<details open><summary><span class="table-glyph">▦</span>${escapeHtml(table.name)}<small>${formatNumber(table.rowCount)}</small></summary>${table.columns.filter((column) => !column.hidden).map((column) => `<button data-action="preview-table" data-table-id="${escapeAttribute(table.id)}" title="Open ${escapeAttribute(table.name)} data"><span>${column.semanticType === 'measure' ? '∑' : column.semanticType === 'date' ? '◷' : '•'}</span>${escapeHtml(column.displayName ?? column.name)}<small>${escapeHtml(column.dataType)}</small></button>`).join('')}</details>`).join('') || '<span class="muted">Import a table to expose fields.</span>'}</div></details>`;
}

function renderVisualBuilder(project: BiProject, table: TableModel | undefined, tableId: string | undefined, visual?: Visual): string {
  const columns = table?.columns ?? [];
  const theme = project.theme ?? DEFAULT_PROJECT_THEME;
  const customColor = Boolean(visual?.color);
  const customBackground = Boolean(visual?.backgroundColor);
  return `<details class="builder inspector-pane" open><summary><span>Visualizations</span><b>${visual ? 'Edit' : '+'}</b></summary><div class="visual-builder"><p class="builder-context">${visual ? `Editing ${escapeHtml(visual.title)}` : 'Configure a chart from real project fields.'}</p>
  <label class="field"><span>Title</span><input id="visual-title" value="${escapeAttribute(visual?.title ?? 'New visual')}"></label><label class="field"><span>Description</span><input id="visual-description" value="${escapeAttribute(visual?.description ?? '')}" placeholder="Accessible description"></label>
  <label class="field"><span>Type</span><select id="visual-type">${selectOptions(['bar', 'horizontalBar', 'line', 'area', 'pie', 'donut', 'scatter', 'table', 'kpi', 'slicer'], visual?.type ?? 'bar')}</select></label><label class="field"><span>Table</span><select id="visual-table">${tableOptions(project, tableId)}</select></label>
  <label class="field"><span>Category / X</span><select id="visual-category"><option value="">None</option>${columnOptions(table, visual?.categoryField)}</select></label><label class="field"><span>Series</span><select id="visual-series"><option value="">None</option>${columnOptions(table, visual?.seriesField)}</select></label><label class="field"><span>Value / Y</span><select id="visual-value"><option value="">None</option>${columnOptions(table, visual?.valueField)}</select></label>
  <label class="field"><span>Measure</span><select id="visual-measure"><option value="">None</option>${project.measures.filter((measure) => measure.tableId === tableId).map((measure) => `<option value="${escapeAttribute(measure.id)}" ${measure.id === visual?.measureId ? 'selected' : ''}>${escapeHtml(measure.name)}</option>`).join('')}</select></label><label class="field"><span>Aggregation</span><select id="visual-aggregation">${selectOptions(['sum', 'avg', 'count', 'countDistinct', 'min', 'max', 'none'], visual?.aggregation ?? 'sum')}</select></label>
  <fieldset class="column-picker"><legend>Table columns</legend>${columns.map((column) => `<label class="check"><input class="visual-column" type="checkbox" value="${escapeAttribute(column.name)}" ${visual ? visual.columns.includes(column.name) ? 'checked' : '' : column.hidden ? '' : 'checked'}>${escapeHtml(column.displayName ?? column.name)}</label>`).join('') || '<span class="muted">No columns</span>'}</fieldset><label class="field"><span>Column order (physical names)</span><input id="visual-column-order" value="${escapeAttribute((visual?.columns.length ? visual.columns : columns.filter((column) => !column.hidden).map((column) => column.name)).join(', '))}" placeholder="region, amount"></label>
  <label class="field"><span>Sort field</span><select id="visual-sort-field"><option value="">Automatic</option>${columnOptions(table, visual?.sortField)}</select></label><label class="field"><span>Sort by</span><select id="visual-sort-by">${selectOptions(['auto', 'category', 'value'], visual?.sortBy ?? 'auto')}</select></label><label class="field"><span>Direction</span><select id="visual-sort-direction">${selectOptions(['asc', 'desc'], visual?.sortDirection ?? (['line', 'area', 'scatter'].includes(visual?.type ?? '') ? 'asc' : 'desc'))}</select></label>
  <label class="field"><span>Width (1–12)</span><input id="visual-width" type="number" min="1" max="12" value="${visual?.width ?? 6}"></label><label class="field"><span>Height (2–12)</span><input id="visual-height" type="number" min="2" max="12" value="${visual?.height ?? 4}"></label><label class="field"><span>Row limit</span><input id="visual-limit" type="number" min="1" max="1000" value="${visual?.limit ?? 100}"></label>
  <label class="field"><span>Number format</span><select id="visual-number-format">${selectOptions(['auto', 'number', 'integer', 'currency', 'percent', 'date', 'datetime', 'text'], visual?.numberFormat ?? 'auto')}</select></label><label class="field"><span>Currency</span><input id="visual-currency" maxlength="3" value="${escapeAttribute(visual?.currency ?? 'EUR')}"></label><label class="field"><span>Decimals</span><input id="visual-decimals" type="number" min="0" max="6" value="${visual?.decimals ?? 2}"></label>
  <label class="field color-field"><span><input id="visual-custom-color" type="checkbox" ${customColor ? 'checked' : ''}> Custom color</span><input id="visual-color" type="color" value="${escapeAttribute(visual?.color ?? theme.primaryColor)}"></label><label class="field color-field"><span><input id="visual-custom-background" type="checkbox" ${customBackground ? 'checked' : ''}> Custom background</span><input id="visual-background" type="color" value="${escapeAttribute(visual?.backgroundColor ?? theme.backgroundColor ?? '#1e1e1e')}"></label>
  <label class="field"><span>Legend position</span><select id="visual-legend-position">${selectOptions(['top', 'right', 'bottom', 'left'], visual?.legendPosition ?? 'bottom')}</select></label><label class="field"><span>Interaction</span><select id="visual-interaction">${selectOptions(['filter', 'none'], visual?.interactionMode ?? 'filter')}</select></label>
  <div class="visual-toggles"><label class="check"><input id="visual-show-legend" type="checkbox" ${visual?.showLegend ?? true ? 'checked' : ''}> Legend</label><label class="check"><input id="visual-show-labels" type="checkbox" ${visual?.showLabels ? 'checked' : ''}> Data labels</label><label class="check"><input id="visual-smooth" type="checkbox" ${visual?.smooth ? 'checked' : ''}> Smooth line</label></div>
  <div class="builder-actions">${visual ? '<button class="secondary" data-action="cancel-visual-edit">Cancel</button>' : ''}<button class="primary" data-action="save-visual" data-id="${escapeAttribute(visual?.id ?? '')}" ${project.tables.length ? '' : 'disabled'}>${visual ? 'Save visual' : 'Add visual'}</button></div></div></details>`;
}

function renderVisualCard(visual: ReportPage['visuals'][number], data: VisualData | undefined, project: BiProject, index: number, count: number): string {
  const style = `grid-column: span ${visual.width}; min-height: ${visual.height * 62}px;${visual.backgroundColor ? ` background:${visual.backgroundColor}; --visual-foreground:${contrastTextColor(visual.backgroundColor)}; color:var(--visual-foreground);` : ''}`;
  let body = `<div class="chart-host" id="chart-${escapeAttribute(visual.id)}"></div>`;
  if (data?.error) body = `<div class="visual-error">${escapeHtml(data.error)}</div>`;
  if (visual.type === 'kpi' && !data?.error) body = `<div class="visual-kpi">${escapeHtml(formatVisualValue(visual, data?.rows[0]?.value, project))}</div>`;
  if (visual.type === 'table' && !data?.error) body = renderMiniTable(data, visual, project);
  if (visual.type === 'slicer' && !data?.error) body = renderSlicer(visual, data);
  return `<article class="visual-card" style="${style}" draggable="true" data-visual-id="${escapeAttribute(visual.id)}" data-index="${index}"><header><span class="drag-handle" title="Drag to reorder">⋮⋮</span><strong title="${escapeAttribute(visual.title)}">${escapeHtml(visual.title)}</strong><span>${escapeHtml(visual.type)}</span><div class="visual-actions"><button data-action="move-visual" data-id="${escapeAttribute(visual.id)}" data-index="${Math.max(0, index - 1)}" ${index === 0 ? 'disabled' : ''} aria-label="Move left" title="Move left">←</button><button data-action="move-visual" data-id="${escapeAttribute(visual.id)}" data-index="${Math.min(count - 1, index + 1)}" ${index === count - 1 ? 'disabled' : ''} aria-label="Move right" title="Move right">→</button><button data-action="export-visual" data-id="${escapeAttribute(visual.id)}" data-format="csv" aria-label="Export ${escapeAttribute(visual.title)} as CSV" title="Export as CSV">↓</button><button data-action="edit-visual" data-id="${escapeAttribute(visual.id)}" aria-label="Edit ${escapeAttribute(visual.title)}" title="Edit">✎</button><button data-action="duplicate-visual" data-id="${escapeAttribute(visual.id)}" aria-label="Duplicate ${escapeAttribute(visual.title)}" title="Duplicate">⧉</button><button class="icon-button" data-action="delete-visual" data-id="${escapeAttribute(visual.id)}" aria-label="Delete ${escapeAttribute(visual.title)}" title="Delete">×</button></div></header>${visual.description ? `<p class="visual-description">${escapeHtml(visual.description)}</p>` : ''}${body}${data?.truncated ? '<small class="limit-note">Result limited</small>' : ''}</article>`;
}

function renderSlicer(visual: ReportPage['visuals'][number], data?: VisualData): string {
  if (!data || data.rows.length === 0 || !visual.categoryField) return '<div class="visual-empty">No values</div>';
  return `<div class="slicer-values" role="group" aria-label="${escapeAttribute(visual.title)}">${data.rows.map((row) => {
    const slicerValue = row.category;
    return `<button class="slicer-value" data-action="slicer-select" data-table-id="${escapeAttribute(visual.tableId)}" data-column="${escapeAttribute(visual.categoryField ?? '')}" data-value="${escapeAttribute(encodeURIComponent(JSON.stringify(slicerValue)))}">${escapeHtml(displayValue(slicerValue))}</button>`;
  }).join('')}</div>`;
}

function renderMiniTable(data: VisualData | undefined, visual: Visual, project: BiProject): string {
  if (!data || data.rows.length === 0) return '<div class="visual-empty">No data</div>';
  const columns = data.columns.map((column) => column.name);
  const table = project.tables.find((item) => item.id === visual.tableId);
  return `<div class="mini-table"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${data.rows.slice(0, 30).map((row) => `<tr>${columns.map((column) => {
    const metadata = table?.columns.find((item) => (item.displayName ?? item.name) === column);
    return `<td>${escapeHtml(formatDisplayValue(row[column], metadata?.format ?? 'auto', visual.currency ?? 'EUR', visual.decimals ?? 2))}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderSettings(state: WorkbenchState): string {
  const settings = state.settings;
  const theme = state.project?.theme ?? DEFAULT_PROJECT_THEME;
  return `<section>${sectionHeading('Settings and privacy', 'Project limits and language-model data boundary.', '<button class="primary" data-action="open-settings">Open VS Code Settings</button>')}
  <div class="settings-list"><article><span><strong>Preview row limit</strong><small>Maximum rows returned by a table preview.</small></span><code>${settings.previewRowLimit}</code></article><article><span><strong>Query row limit</strong><small>Maximum rows returned by an ad-hoc query.</small></span><code>${settings.queryRowLimit}</code></article><article><span><strong>Auto-save</strong><small>Persist metadata after validated changes.</small></span><code>${settings.autoSave ? 'enabled' : 'disabled'}</code></article><article class="privacy-setting"><span><strong>Copilot data sharing</strong><small><b>${escapeHtml(settings.copilotDataSharing)}</b> — schema is the default; aggregates or samples require explicit selection.</small></span><code>max ${settings.maxCopilotSampleRows} samples</code></article></div>
  ${state.project ? `<div class="panel theme-editor"><h2>Report theme</h2><div class="form-grid"><label class="field"><span>Theme name</span><input id="theme-name" value="${escapeAttribute(theme.name)}"></label><label class="field"><span>Primary color</span><input id="theme-primary" type="color" value="${escapeAttribute(theme.primaryColor)}"></label><label class="field"><span>Dashboard background</span><input id="theme-background" type="color" value="${escapeAttribute(theme.backgroundColor ?? '#1e1e1e')}"></label><label class="field wide"><span>Palette (hex colors, comma separated)</span><input id="theme-palette" value="${escapeAttribute(theme.palette.join(', '))}"></label></div><button class="primary" data-action="save-theme">Save project theme</button></div>` : ''}
  <div class="warning-panel"><strong>Sensitive data warning</strong><p>Using <code>@bi</code> invokes the model provider selected in VS Code. Schema mode excludes raw values. Sample mode can disclose values; do not enable it for confidential data without authorization.</p></div></section>`;
}

function renderHelp(): string {
  return `<section>${sectionHeading('Help', 'A compact route through the first usable workflow.', '<div class="heading-actions"><button class="secondary" data-action="show-logs">Open logs</button><button class="primary" data-action="open-help">Open full README</button></div>')}
  <div class="help-steps"><article><b>1</b><div><h3>Create a project</h3><p>Select a parent folder. BI Workbench creates a documented JSON project and local DuckDB database.</p></div></article><article><b>2</b><div><h3>Import data</h3><p>Use Import for CSV, JSON, XLSX, Parquet, DuckDB, or SQLite. Source files are not modified.</p></div></article><article><b>3</b><div><h3>Query and clean</h3><p>Run bounded read-only SQL, inspect profiles, then create transactional derived tables.</p></div></article><article><b>4</b><div><h3>Model and calculate</h3><p>Configure labels, formats, relationships, and SQL measures. Definitions are validated before save.</p></div></article><article><b>5</b><div><h3>Build reports</h3><p>Edit visual fields, series, sort, format, size, and interaction. Related visuals follow valid relationship paths.</p></div></article><article><b>6</b><div><h3>Ask Copilot or export</h3><p>Use <code>@bi /powerbi</code> or Export Power BI. Every table is copied locally and the extension creates PBIP, PBIR and TMDL files.</p></div></article></div><h2>Known v0.3 boundaries</h2><ul class="limitations"><li>PBIX is not generated directly; open PBIP in Power BI Desktop and use Save As.</li><li>Only conservative SQL aggregate measures are translated to DAX; unsupported measures are reported.</li><li>Saved page filters and advanced visual formatting are not yet translated.</li><li>PostgreSQL, MySQL, ODBC, cloud connectors, undo/redo, maps, and PDF/PNG export remain planned.</li></ul></section>`;
}

function renderResultGrid(result: QueryResult): string {
  if (result.columns.length === 0) return emptyState('No columns', 'The query returned no tabular result.');
  return `<div class="data-grid"><table><thead><tr>${result.columns.map((column) => `<th><span>${escapeHtml(column.name)}</span><small>${escapeHtml(column.dataType)}</small></th>`).join('')}</tr></thead><tbody>${result.rows.map((row) => `<tr>${result.columns.map((column) => `<td title="${escapeAttribute(displayValue(row[column.name]))}">${escapeHtml(displayValue(row[column.name]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${result.truncated ? '<p class="limit-note">The configured row limit was reached. Refine the query or raise the setting deliberately.</p>' : ''}`;
}

function sectionHeading(title: string, subtitle: string, actions = ''): string {
  return `<div class="section-heading"><div><p class="eyebrow">BI WORKBENCH</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${actions}</div>`;
}

function noProject(): string {
  return emptyState('No project open', 'Create or open a BI project to use this feature.', '<button class="primary" data-action="create-project">Create project</button><button class="secondary" data-action="open-project">Open project</button>');
}

function emptyState(title: string, text: string, actions = ''): string {
  return `<div class="empty-state"><div>◇</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><span>${actions}</span></div>`;
}

function tableOptions(project: BiProject, selected?: string): string {
  return project.tables.map((table) => `<option value="${escapeAttribute(table.id)}" ${table.id === selected ? 'selected' : ''}>${escapeHtml(table.name)}</option>`).join('');
}

function columnOptions(table?: TableModel, selected?: string): string {
  return table?.columns.map((column) => `<option value="${escapeAttribute(column.name)}" ${column.name === selected ? 'selected' : ''}>${escapeHtml(column.displayName ?? column.name)} · ${escapeHtml(column.dataType)}</option>`).join('') ?? '';
}

function tableName(project: BiProject, tableId: string): string {
  return project.tables.find((table) => table.id === tableId)?.name ?? 'Missing table';
}

function columnDisplayName(project: BiProject, tableId: string, columnName: string): string {
  return project.tables.find((table) => table.id === tableId)?.columns.find((column) => column.name === columnName)?.displayName ?? columnName;
}

function selectOptions(values: readonly string[], selected: string): string {
  return values.map((value) => `<option value="${escapeAttribute(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(humanize(value))}</option>`).join('');
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());
}

function formatVisualValue(visual: Visual, value: unknown, project: BiProject): string {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return displayValue(value);
  const measure = visual.measureId ? project.measures.find((item) => item.id === visual.measureId) : undefined;
  const column = project.tables.find((table) => table.id === visual.tableId)?.columns.find((item) => item.name === visual.valueField);
  const format = visual.numberFormat && visual.numberFormat !== 'auto' ? visual.numberFormat : measure?.format ?? column?.format ?? 'number';
  const decimals = visual.decimals ?? 2;
  if (format === 'integer') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
  if (format === 'currency') return new Intl.NumberFormat(undefined, { style: 'currency', currency: visual.currency ?? 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  if (format === 'percent') return new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
}

function describeStep(step: TransformationStep): string {
  switch (step.type) {
    case 'select': return step.columns.join(', ');
    case 'rename': return `${step.column} → ${step.newName}`;
    case 'cast': return `${step.column} as ${step.dataType}`;
    case 'filter': return `${step.column} ${step.operator} ${String(step.value ?? '')}`;
    case 'fillNull': return `${step.column} = ${String(step.value ?? '')}`;
    case 'deduplicate': return 'all columns';
    case 'sort': return `${step.column} ${step.direction}`;
    case 'replace': return `${step.column}: ${String(step.find)} → ${String(step.replacement)} (${step.mode})`;
    case 'datePart': return `${step.part}(${step.column}) → ${step.newName}`;
    case 'group': return `${step.groupBy.join(', ') || 'all rows'} · ${step.aggregations.map((aggregation) => `${aggregation.function}(${aggregation.column}) as ${aggregation.name}`).join(', ')}`;
  }
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDisplayValue(value: unknown, format: string, currency: string, decimals: number): string {
  if (value === null || value === undefined) return 'NULL';
  if (format === 'date' || format === 'datetime') {
    const date = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(undefined, format === 'date' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }
  }
  const numeric = typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : Number(String(value));
  if (Number.isFinite(numeric)) {
    if (format === 'currency') return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(numeric);
    if (format === 'percent') return new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(numeric);
    if (format === 'integer') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numeric);
    if (format === 'number') return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(numeric);
  }
  return displayValue(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function contrastTextColor(background: string): '#111827' | '#f3f4f6' {
  const red = Number.parseInt(background.slice(1, 3), 16) / 255;
  const green = Number.parseInt(background.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(background.slice(5, 7), 16) / 255;
  const linear = [red, green, blue].map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
  return luminance > 0.45 ? '#111827' : '#f3f4f6';
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
