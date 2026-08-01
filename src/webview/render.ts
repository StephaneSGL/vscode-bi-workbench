import type { BiProject, ColumnProfile, QueryResult, ReportPage, TableModel, TransformationStep, VisualData } from '../shared/project.js';
import type { WorkbenchSection, WorkbenchState } from '../shared/state.js';

export interface UiDraft {
  transformationSteps: TransformationStep[];
  transformSourceId?: string;
  relationshipFromTableId?: string;
  relationshipToTableId?: string;
  filterTableId?: string;
  visualTableId?: string;
  busy?: string;
  toast?: { level: 'info' | 'warning' | 'error'; message: string };
}

const NAVIGATION: { id: WorkbenchSection; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'import', label: 'Import', icon: '↓' },
  { id: 'data', label: 'Data', icon: '▦' },
  { id: 'query', label: 'Query', icon: '›_' },
  { id: 'transform', label: 'Transform', icon: '↻' },
  { id: 'model', label: 'Model', icon: '⋈' },
  { id: 'measures', label: 'Measures', icon: '∑' },
  { id: 'reports', label: 'Reports', icon: '▥' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'help', label: 'Help', icon: '?' }
];

export function renderApp(state: WorkbenchState, draft: UiDraft): string {
  const projectName = state.project?.name ?? 'No project open';
  return `
    <div class="workbench-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true">▥</span><div><strong>BI Workbench</strong><small>Local analytics for VS Code</small></div></div>
        <div class="project-status"><span class="privacy-dot"></span><span>${escapeHtml(projectName)}</span>${state.dirty ? '<span class="dirty">Unsaved</span>' : state.project ? '<span class="saved">Saved</span>' : ''}</div>
        <div class="top-actions">
          <button class="secondary" data-action="create-project">New</button>
          <button class="secondary" data-action="open-project">Open</button>
          <button class="primary" data-action="save-project" ${state.project ? '' : 'disabled'}>Save</button>
        </div>
      </header>
      <aside class="sidebar" aria-label="BI Workbench navigation">
        <nav>${NAVIGATION.map((item) => `<button class="nav-item ${state.activeSection === item.id ? 'active' : ''}" data-action="navigate" data-section="${item.id}"><span aria-hidden="true">${item.icon}</span>${item.label}</button>`).join('')}</nav>
        <div class="sidebar-footer"><span>DuckDB ${escapeHtml(state.engineVersion ?? 'not started')}</span><span>Data remains local by default</span></div>
      </aside>
      <main class="content">
        ${state.error ? `<div class="error-banner"><strong>Operation failed</strong><span>${escapeHtml(state.error)}</span><button data-action="show-logs">Open logs</button></div>` : ''}
        ${renderSection(state, draft)}
      </main>
      ${draft.busy ? `<div class="busy" role="status"><span class="spinner"></span>${escapeHtml(draft.busy)}</div>` : ''}
      ${draft.toast ? `<div class="toast ${draft.toast.level}" role="status">${escapeHtml(draft.toast.message)}</div>` : ''}
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
    case 'measures': return renderMeasures(state);
    case 'reports': return renderReports(state, draft);
    case 'settings': return renderSettings(state);
    case 'help': return renderHelp();
  }
}

function renderHome(state: WorkbenchState): string {
  if (!state.project) {
    return `<section class="empty-home"><div class="hero-mark">▥</div><p class="eyebrow">BUSINESS INTELLIGENCE, INSIDE YOUR EDITOR</p><h1>Build a real local data project.</h1><p>Import files, run DuckDB SQL, define a semantic model, create interactive reports, and ask GitHub Copilot through <code>@bi</code>.</p><div class="hero-actions"><button class="primary large" data-action="create-project">Create a project</button><button class="secondary large" data-action="open-project">Open a project</button></div>${renderRecent(state.recentProjects)}</section>`;
  }
  const project = state.project;
  const rowCount = project.tables.reduce((sum, table) => sum + table.rowCount, 0);
  return `<section><div class="section-heading"><div><p class="eyebrow">PROJECT OVERVIEW</p><h1>${escapeHtml(project.name)}</h1><p>${escapeHtml(project.description || 'Local-first analytical project')}</p></div><button class="primary" data-action="import-data">Import data</button></div>
  <div class="metric-grid"><article class="metric"><span>Tables</span><strong>${project.tables.length}</strong><small>${formatNumber(rowCount)} total rows</small></article><article class="metric"><span>Relationships</span><strong>${project.relationships.length}</strong><small>semantic links</small></article><article class="metric"><span>Measures</span><strong>${project.measures.length}</strong><small>reusable calculations</small></article><article class="metric"><span>Reports</span><strong>${project.reports.length}</strong><small>${project.reports.reduce((sum, report) => sum + report.pages.length, 0)} pages</small></article></div>
  <h2>Continue working</h2><div class="quick-grid"><button class="quick" data-action="navigate" data-section="import"><b>01</b><span><strong>Import data</strong><small>CSV, JSON, XLSX, Parquet, DuckDB</small></span></button><button class="quick" data-action="navigate" data-section="query"><b>02</b><span><strong>Run SQL</strong><small>Bounded read-only DuckDB queries</small></span></button><button class="quick" data-action="navigate" data-section="model"><b>03</b><span><strong>Build the model</strong><small>Relationships and measures</small></span></button><button class="quick" data-action="navigate" data-section="reports"><b>04</b><span><strong>Create a report</strong><small>Interactive charts and filters</small></span></button></div>
  <div class="copilot-callout"><span class="callout-mark">@bi</span><div><strong>GitHub Copilot is project-aware</strong><p>Open Chat and use <code>@bi /sql</code>, <code>/analyze</code>, <code>/report</code>, or <code>/visual</code>. Schema-only sharing is the default.</p></div></div></section>`;
}

function renderRecent(recent: readonly string[]): string {
  if (recent.length === 0) return '';
  return `<div class="recent"><h2>Recent projects</h2>${recent.slice(0, 5).map((item) => `<div class="recent-item"><span>${escapeHtml(item)}</span></div>`).join('')}</div>`;
}

function renderImport(state: WorkbenchState): string {
  return `<section>${sectionHeading('Import data', 'Bulk import into the project DuckDB database. Original files are never modified.', '<button class="primary" data-action="import-data" '+(state.project ? '' : 'disabled')+'>Choose files</button>')}
  ${!state.project ? noProject() : `<div class="connector-grid">${connector('CSV / TSV', 'Type inference, headers, strict parsing', 'Ready')}${connector('JSON / JSONL', 'Objects and newline-delimited records', 'Ready')}${connector('Excel XLSX', 'All non-empty worksheets, offline parser', 'Ready')}${connector('Parquet', 'Columnar bulk import', 'Ready')}${connector('DuckDB', 'Copy all base tables from a local database', 'Ready')}${connector('PostgreSQL / MySQL / SQLite / ODBC', 'Credential-safe connectors and cancellation', 'Planned v0.2+', true)}</div><div class="info-panel"><strong>Import behavior</strong><ul><li>Data is copied into <code>.bi-workbench/data.duckdb</code>.</li><li>Names are normalized and made unique; display names are preserved.</li><li>Any failure rolls back the active import transaction.</li><li>The generated data directory is ignored by Git by default.</li></ul></div>`}</section>`;
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
  <div class="panel"><h2>Add a step</h2><label class="field"><span>Operation</span><select id="transform-type"><option value="filter">Filter rows</option><option value="select">Select columns</option><option value="rename">Rename column</option><option value="cast">Change type</option><option value="fillNull">Fill null values</option><option value="deduplicate">Remove duplicates</option><option value="sort">Sort rows</option></select></label><label class="field"><span>Column</span><select id="transform-column">${columnOptions(source)}</select></label><label class="field"><span>Operator / type / direction</span><select id="transform-operator"><option value="eq">equals</option><option value="neq">not equals</option><option value="contains">contains</option><option value="gt">greater than</option><option value="gte">greater or equal</option><option value="lt">less than</option><option value="lte">less or equal</option><option value="between">between</option><option value="VARCHAR">VARCHAR</option><option value="BIGINT">BIGINT</option><option value="DOUBLE">DOUBLE</option><option value="BOOLEAN">BOOLEAN</option><option value="DATE">DATE</option><option value="TIMESTAMP">TIMESTAMP</option><option value="asc">ascending</option><option value="desc">descending</option></select></label><label class="field"><span>Value / new name / comma-separated columns</span><input id="transform-value" placeholder="Example: France or revenue,total"></label><label class="field"><span>Second value (between)</span><input id="transform-second-value"></label><button class="primary full" data-action="add-transform-step">Add step</button><div class="sql-preview"><small>Execution model</small><code>source → ordered CTE steps → new DuckDB table</code></div></div></div></section>`;
}

function renderModel(state: WorkbenchState, draft: UiDraft): string {
  if (!state.project) return `<section>${sectionHeading('Semantic model', 'Define validated relationships between tables.')}${noProject()}</section>`;
  const project = state.project;
  const fromId = draft.relationshipFromTableId ?? project.tables[0]?.id;
  const toId = draft.relationshipToTableId ?? project.tables[1]?.id ?? project.tables[0]?.id;
  const from = project.tables.find((table) => table.id === fromId);
  const to = project.tables.find((table) => table.id === toId);
  return `<section>${sectionHeading('Semantic model', 'Relationships are original project metadata and guide joins/Copilot context.')}
  <div class="model-summary">${project.tables.map((table) => `<article><header><strong>${escapeHtml(table.name)}</strong><span>${table.kind}</span></header>${table.columns.map((column) => `<div><span>${escapeHtml(column.name)}</span><small>${escapeHtml(column.dataType)}</small></div>`).join('')}</article>`).join('')}</div>
  <div class="split"><div class="panel"><h2>Relationships</h2>${project.relationships.length ? project.relationships.map((relationship) => `<div class="relationship"><span><b>${escapeHtml(tableName(project, relationship.fromTableId))}.${escapeHtml(relationship.fromColumn)}</b><small>${escapeHtml(relationship.cardinality)} · ${escapeHtml(relationship.filterDirection)}</small><b>${escapeHtml(tableName(project, relationship.toTableId))}.${escapeHtml(relationship.toColumn)}</b></span><button class="icon-button" data-action="delete-relationship" data-id="${escapeAttribute(relationship.id)}">×</button></div>`).join('') : '<p class="muted">No relationships defined.</p>'}</div><div class="panel"><h2>Add relationship</h2><div class="form-grid"><label class="field"><span>From table</span><select id="rel-from-table">${tableOptions(project, fromId)}</select></label><label class="field"><span>From column</span><select id="rel-from-column">${columnOptions(from)}</select></label><label class="field"><span>To table</span><select id="rel-to-table">${tableOptions(project, toId)}</select></label><label class="field"><span>To column</span><select id="rel-to-column">${columnOptions(to)}</select></label><label class="field"><span>Cardinality</span><select id="rel-cardinality"><option value="many-to-one">Many to one</option><option value="one-to-many">One to many</option><option value="one-to-one">One to one</option><option value="many-to-many">Many to many</option></select></label><label class="field"><span>Filter direction</span><select id="rel-direction"><option value="single">Single</option><option value="both">Both</option></select></label></div><button class="primary full" data-action="add-relationship" ${project.tables.length ? '' : 'disabled'}>Validate and add</button></div></div></section>`;
}

function renderMeasures(state: WorkbenchState): string {
  if (!state.project) return `<section>${sectionHeading('Measures', 'Reusable SQL aggregate calculations.')}${noProject()}</section>`;
  const project = state.project;
  return `<section>${sectionHeading('Measures', 'Expressions are validated against DuckDB. This is not DAX compatibility.')}
  <div class="split"><div class="panel"><h2>Defined measures</h2>${project.measures.length ? project.measures.map((measure) => `<div class="measure"><span><strong>${escapeHtml(measure.name)}</strong><code>${escapeHtml(measure.expression)}</code><small>${escapeHtml(tableName(project, measure.tableId))} · ${escapeHtml(measure.format)}</small></span><button class="icon-button" data-action="delete-measure" data-id="${escapeAttribute(measure.id)}">×</button></div>`).join('') : '<p class="muted">No measures defined.</p>'}</div><div class="panel"><h2>New measure</h2><label class="field"><span>Name</span><input id="measure-name" value="Total"></label><label class="field"><span>Home table</span><select id="measure-table">${tableOptions(project)}</select></label><label class="field"><span>Aggregate SQL expression</span><textarea id="measure-expression" class="small-code">SUM(&quot;amount&quot;)</textarea></label><label class="field"><span>Format</span><select id="measure-format"><option value="number">Number</option><option value="integer">Integer</option><option value="currency">Currency</option><option value="percent">Percent</option><option value="text">Text</option></select></label><label class="field"><span>Description</span><input id="measure-description" placeholder="Optional business definition"></label><button class="primary full" data-action="add-measure" ${project.tables.length ? '' : 'disabled'}>Validate and save</button></div></div></section>`;
}

function renderReports(state: WorkbenchState, draft: UiDraft): string {
  if (!state.project) return `<section>${sectionHeading('Reports', 'Interactive dashboard pages backed by real queries.')}${noProject()}</section>`;
  const project = state.project;
  const report = project.reports.find((item) => item.id === state.selectedReportId) ?? project.reports[0];
  const page = report?.pages.find((item) => item.id === state.selectedPageId) ?? report?.pages[0];
  if (!report || !page) return `<section>${emptyState('No report page', 'Create a report to continue.')}</section>`;
  const filterTableId = draft.filterTableId ?? project.tables[0]?.id;
  const filterTable = project.tables.find((table) => table.id === filterTableId);
  const visualTableId = draft.visualTableId ?? project.tables[0]?.id;
  const visualTable = project.tables.find((table) => table.id === visualTableId);
  return `<section class="reports-section">${sectionHeading('Reports', 'Each visual executes a bounded query. Chart clicks create temporary cross-filters.', `<div class="heading-actions"><button class="secondary" data-action="clear-interactions">Clear interactions</button><button class="primary" data-action="export-report">Export HTML</button></div>`)}
  <div class="report-toolbar"><div class="report-tabs">${project.reports.map((item) => `<button class="${item.id === report.id ? 'active' : ''}" data-action="load-page" data-report-id="${escapeAttribute(item.id)}" data-page-id="${escapeAttribute(item.pages[0]?.id ?? '')}">${escapeHtml(item.name)}</button>`).join('')}<button class="icon-button" data-action="delete-report" data-id="${escapeAttribute(report.id)}" aria-label="Delete selected report" ${project.reports.length > 1 ? '' : 'disabled'}>×</button><input id="new-report-name" placeholder="New report"><button data-action="add-report" aria-label="Add report">+</button></div><div class="page-tabs">${report.pages.map((item) => `<button class="${item.id === page.id ? 'active' : ''}" data-action="load-page" data-report-id="${escapeAttribute(report.id)}" data-page-id="${escapeAttribute(item.id)}">${escapeHtml(item.name)}</button>`).join('')}<button class="icon-button" data-action="delete-page" data-id="${escapeAttribute(page.id)}" aria-label="Delete selected page" ${report.pages.length > 1 ? '' : 'disabled'}>×</button><input id="new-page-name" placeholder="New page"><button data-action="add-page" aria-label="Add page">+</button></div></div>
  <div class="filter-bar"><strong>Filters</strong>${page.filters.map((filter) => `<span class="filter-chip ${filter.temporary ? 'temporary' : ''}">${escapeHtml(tableName(project, filter.tableId))}.${escapeHtml(filter.column)} ${escapeHtml(filter.operator)} ${escapeHtml(String(filter.value ?? ''))}<button data-action="delete-filter" data-id="${escapeAttribute(filter.id)}">×</button></span>`).join('') || '<span class="muted">None</span>'}<span class="spacer"></span><select id="filter-table">${tableOptions(project, filterTableId)}</select><select id="filter-column">${columnOptions(filterTable)}</select><select id="filter-operator"><option value="eq">=</option><option value="neq">≠</option><option value="contains">contains</option><option value="gt">&gt;</option><option value="gte">≥</option><option value="lt">&lt;</option><option value="lte">≤</option><option value="between">between</option><option value="isNull">is null</option><option value="isNotNull">is not null</option></select><input id="filter-value" placeholder="Value"><input id="filter-second" placeholder="Second"><button data-action="add-filter">Apply</button></div>
  <div class="dashboard-grid">${page.visuals.length ? page.visuals.map((visual) => renderVisualCard(visual, state.visualData.find((item) => item.visualId === visual.id))).join('') : `<div class="dashboard-empty">${emptyState('Blank report page', 'Use the visual builder below to add a real chart.')}</div>`}</div>
  <details class="builder" open><summary>Add a visualization</summary><div class="visual-builder"><label class="field"><span>Title</span><input id="visual-title" value="New visual"></label><label class="field"><span>Type</span><select id="visual-type"><option value="bar">Bar</option><option value="horizontalBar">Horizontal bar</option><option value="line">Line</option><option value="area">Area</option><option value="pie">Pie</option><option value="donut">Donut</option><option value="scatter">Scatter</option><option value="table">Table</option><option value="kpi">KPI</option><option value="slicer">Slicer</option></select></label><label class="field"><span>Table</span><select id="visual-table">${tableOptions(project, visualTableId)}</select></label><label class="field"><span>Category / X</span><select id="visual-category"><option value="">None</option>${columnOptions(visualTable)}</select></label><label class="field"><span>Value / Y</span><select id="visual-value"><option value="">None</option>${columnOptions(visualTable)}</select></label><label class="field"><span>Measure</span><select id="visual-measure"><option value="">None</option>${project.measures.filter((measure) => measure.tableId === visualTableId).map((measure) => `<option value="${escapeAttribute(measure.id)}">${escapeHtml(measure.name)}</option>`).join('')}</select></label><label class="field"><span>Aggregation</span><select id="visual-aggregation"><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count rows</option><option value="countDistinct">Distinct count</option><option value="min">Minimum</option><option value="max">Maximum</option><option value="none">None</option></select></label><label class="field"><span>Table columns (comma separated)</span><input id="visual-columns" placeholder="customer, revenue"></label><label class="field"><span>Limit</span><input id="visual-limit" type="number" min="1" max="1000" value="100"></label><button class="primary" data-action="add-visual" ${project.tables.length ? '' : 'disabled'}>Add visual</button></div></details></section>`;
}

function renderVisualCard(visual: ReportPage['visuals'][number], data?: VisualData): string {
  const style = `grid-column: span ${visual.width}; min-height: ${visual.height * 62}px`;
  let body = `<div class="chart-host" id="chart-${escapeAttribute(visual.id)}"></div>`;
  if (data?.error) body = `<div class="visual-error">${escapeHtml(data.error)}</div>`;
  if (visual.type === 'kpi' && !data?.error) body = `<div class="visual-kpi">${escapeHtml(String(data?.rows[0]?.value ?? '—'))}</div>`;
  if (visual.type === 'table' && !data?.error) body = renderMiniTable(data);
  if (visual.type === 'slicer' && !data?.error) body = renderSlicer(visual, data);
  return `<article class="visual-card" style="${style}" data-visual-id="${escapeAttribute(visual.id)}"><header><strong>${escapeHtml(visual.title)}</strong><span>${escapeHtml(visual.type)}</span><button class="icon-button" data-action="delete-visual" data-id="${escapeAttribute(visual.id)}">×</button></header>${body}${data?.truncated ? '<small class="limit-note">Result limited</small>' : ''}</article>`;
}

function renderSlicer(visual: ReportPage['visuals'][number], data?: VisualData): string {
  if (!data || data.rows.length === 0 || !visual.categoryField) return '<div class="visual-empty">No values</div>';
  return `<div class="slicer-values" role="group" aria-label="${escapeAttribute(visual.title)}">${data.rows.map((row) => {
    const slicerValue = row.category;
    return `<button class="slicer-value" data-action="slicer-select" data-table-id="${escapeAttribute(visual.tableId)}" data-column="${escapeAttribute(visual.categoryField ?? '')}" data-value="${escapeAttribute(encodeURIComponent(JSON.stringify(slicerValue)))}">${escapeHtml(displayValue(slicerValue))}</button>`;
  }).join('')}</div>`;
}

function renderMiniTable(data?: VisualData): string {
  if (!data || data.rows.length === 0) return '<div class="visual-empty">No data</div>';
  const columns = data.columns.map((column) => column.name);
  return `<div class="mini-table"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${data.rows.slice(0, 30).map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(displayValue(row[column]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderSettings(state: WorkbenchState): string {
  const settings = state.settings;
  return `<section>${sectionHeading('Settings and privacy', 'Project limits and language-model data boundary.', '<button class="primary" data-action="open-settings">Open VS Code Settings</button>')}
  <div class="settings-list"><article><span><strong>Preview row limit</strong><small>Maximum rows returned by a table preview.</small></span><code>${settings.previewRowLimit}</code></article><article><span><strong>Query row limit</strong><small>Maximum rows returned by an ad-hoc query.</small></span><code>${settings.queryRowLimit}</code></article><article><span><strong>Auto-save</strong><small>Persist metadata after validated changes.</small></span><code>${settings.autoSave ? 'enabled' : 'disabled'}</code></article><article class="privacy-setting"><span><strong>Copilot data sharing</strong><small><b>${escapeHtml(settings.copilotDataSharing)}</b> — schema is the default; aggregates or samples require explicit selection.</small></span><code>max ${settings.maxCopilotSampleRows} samples</code></article></div><div class="warning-panel"><strong>Sensitive data warning</strong><p>Using <code>@bi</code> invokes the model provider selected in VS Code. Schema mode excludes raw values. Sample mode can disclose values; do not enable it for confidential data without authorization.</p></div></section>`;
}

function renderHelp(): string {
  return `<section>${sectionHeading('Help', 'A compact route through the first usable workflow.', '<div class="heading-actions"><button class="secondary" data-action="show-logs">Open logs</button><button class="primary" data-action="open-help">Open full README</button></div>')}
  <div class="help-steps"><article><b>1</b><div><h3>Create a project</h3><p>Select a parent folder. BI Workbench creates a documented JSON project and local DuckDB database.</p></div></article><article><b>2</b><div><h3>Import data</h3><p>Use the Import page for CSV, JSON, XLSX, Parquet, or DuckDB. Imported files are not modified.</p></div></article><article><b>3</b><div><h3>Query and clean</h3><p>Run read-only SQL, inspect profiles, then create derived tables through transformation steps.</p></div></article><article><b>4</b><div><h3>Model and calculate</h3><p>Define relationships and SQL measures. Each definition is validated before save.</p></div></article><article><b>5</b><div><h3>Build reports</h3><p>Add visuals and page filters. Click chart categories to cross-filter the current page.</p></div></article><article><b>6</b><div><h3>Ask Copilot</h3><p>Open Chat and type <code>@bi /sql</code> followed by your request.</p></div></article></div><h2>Known v0.1 boundaries</h2><ul class="limitations"><li>No PBIX reader/writer, DAX, or Power Query compatibility.</li><li>Database connector v0.1 is DuckDB; PostgreSQL, MySQL, SQLite, and ODBC are later.</li><li>Cross-filter propagation is same-table only.</li><li>Freeform drag/resize and PDF/PNG export are planned for v0.2.</li></ul></section>`;
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

function columnOptions(table?: TableModel): string {
  return table?.columns.map((column) => `<option value="${escapeAttribute(column.name)}">${escapeHtml(column.name)} · ${escapeHtml(column.dataType)}</option>`).join('') ?? '';
}

function tableName(project: BiProject, tableId: string): string {
  return project.tables.find((table) => table.id === tableId)?.name ?? 'Missing table';
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
  }
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
