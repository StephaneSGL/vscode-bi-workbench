# Complete user-interface inventory

This is the product-level interface map for v0.2.0. **Available** means the control invokes real host behavior and persists or queries real project state. **Partial** names the exact smaller workflow. **Planned** is not presented as an enabled control.

## 1. Explorer sidebar and project explorer

- BI Workbench views embedded directly in the standard VS Code Explorer sidebar, matching the placement used by Excel AI & VBA Studio.
- **Project** tree: tables with row counts, sources with formats and saved queries.
- **Semantic Model** tree: tables, physical/display columns, relationships and measures.
- **Reports** tree: reports, pages and visuals.
- Title actions for open workbench, import and save.
- Empty-state create/open actions and Explorer action for `*.bi.json`.

Status: **Available**. Fine-grained node context menus are **planned**.

## 2. Home screen

- Local/private execution identity, active project name and saved/dirty indicator.
- Create/open/save actions and recent-project list.
- Quick routes for import, query, reports and `@bi`.
- Project counts for tables/rows, relationships, measures, reports and pages.
- Links to Settings, packaged help and the output log.

Status: **Available**. On-disk database-size telemetry is **planned**.

## 3. Import center

- Multi-file picker for `.csv`, `.tsv`, `.json`, `.jsonl`, `.ndjson`, `.xlsx`, `.parquet`, `.duckdb`, `.sqlite`, `.sqlite3` and `.db`.
- `.db` files are dispatched by header: SQLite magic uses the portable SQLite reader; otherwise the DuckDB connector is attempted.
- CSV/JSON/Parquet type inference, every non-empty XLSX sheet, every DuckDB base table and every SQLite user table, including empty tables.
- Transactional target copy, normalized unique identifiers, preserved display names, busy state, row counts and actionable errors.
- PostgreSQL/MySQL/ODBC cards are visible as **Planned** and disabled.

Status: local file/database imports are **Available**. SQLite is read-only and capped at 512 MiB. Pre-import data preview, worksheet selection, append/replace policy and server connectors are **Planned**.

## 4. Data preview and profiling

- Table selection from navigation/tree.
- Bounded scrollable grid with sticky typed headers and truncation-safe cells.
- Row count, null count, distinct count, minimum, maximum and numeric mean.
- Explicit warning when the preview limit is reached.

Status: **Available**. Pagination, cell editing, grid sorting/filtering, histograms and selection-to-visual are **Planned**.

## 5. Query editor

- DuckDB SQL editor with Run and Cancel controls, execution duration and result-bound warning.
- Schema sidebar with quoted-field insertion.
- Read-only mode indicator, sanitized inline error, detailed output log, saved-query name/list and reload.
- Formula-safe CSV and JSON result export.

Status: bounded read-only `SELECT`/`WITH` execution, timeout and DuckDB interruption are **Available**. Query history and SQL language-service diagnostics are **Planned**.

## 6. Cleaning and transformations

- Source/target selectors and ordered recipe list.
- Select columns, rename, cast, filter, fill null, deduplicate and sort.
- Exact or substring replacement.
- Year/quarter/month/week/day/day-of-week/hour extraction into a named column.
- Group-by columns plus one or more parsed aggregate definitions.
- Clear/remove steps and apply to a transactional derived table.
- Failure retains the previous valid table and reports the exact operation.

Status: the listed transformations are **Available**. Join/merge, split, pivot/unpivot, step drag ordering, preview diff, fuzzy matching and custom scripts are **Planned**.

## 7. Semantic model and table presentation

- Table selector, physical name, editable display name and description.
- Per-column physical/display name, description, semantic type, default display format and hidden flag.
- Model summary cards using configured labels.
- Relationship create/edit/delete: source/target table and column, cardinality, single/both filter direction and active flag.
- Host validation for referenced objects, compatible types, duplicate relationships and invalid self-reference.

Status: presentation metadata and relationship editing are **Available**. Active relationships drive direction-aware filter propagation across unique multi-hop paths. A draggable diagram canvas is **Planned**.

## 8. Measures and calculations

- Create and edit name, description, home table, number format and DuckDB SQL aggregate expression.
- Cancel editing, delete and reuse in visuals.
- Execute a bounded validation query before commit and show a preview value.

Status: **Available**, limited to safe SQL aggregate expressions. DAX and cross-table measure expressions are not supported.

## 9. Report manager

- Report/page tabs with add/delete, active selection and saved/dirty state.
- Expandable report/page settings for editable names and descriptions.
- Deterministic responsive 12-column dashboard grid.
- Visual create/edit/duplicate/delete, move-left/right, drag reorder and persisted width/height fields.
- Export active page and clear temporary interactions.

Status: **Available**. Pixel-free placement, mouse resize handles and undo/redo are **Planned**.

## 10. Visual builder and renderers

- Types: table, KPI, vertical bar, horizontal bar, line, area, pie, donut, scatter and categorical slicer.
- Title and accessible description.
- Source table, category/X, optional series, value/Y or measure, aggregation and row/category limit.
- Table-column checkboxes and explicit physical-name column order.
- Sort field, category/value/automatic sort and ascending/descending direction.
- Width `1–12`, height `2–12`, custom primary/background colors and project theme palette.
- Legend visibility/position, data labels, line smoothing and interaction mode.
- Auto/number/integer/currency/percent/date/datetime/text format, ISO currency and decimal precision.
- Tooltips, resize handling, theme adaptation, empty/error state and screen-reader description.
- Per-visual CSV data export.

Status: all listed configuration persists and is **Available**. A visual's real bounded query must succeed before its metadata is committed. Maps, combo/waterfall/treemap/heatmap/funnel/gauge/boxplot/histogram and custom Vega-Lite are **Planned**.

## 11. Filters, slicers and visual interactions

- Page-filter bar with table, column, operator, value and optional second value.
- Operators: equals, not equals, contains, greater/less than, inclusive comparisons, between, is null and is not null.
- Active filter chips, individual removal and clear temporary interactions.
- Categorical slicer buttons and chart-category clicks.
- Per-visual interaction mode `filter` or `none`.
- Same-table predicates and related-table propagation along direction-compatible active relationships.

Status: **Available**. If two equally short relationship paths could propagate a filter, the query fails with an ambiguity error rather than choosing silently.

## 12. Export

- Query results to CSV or JSON.
- Individual visual data to CSV.
- Active report page to standalone HTML with bounded data and dependency-free table/KPI/SVG/CSS renderers.
- Project metadata remains JSON; imported/derived data remains DuckDB.

Status: **Available** for the listed formats. HTML is a static snapshot, not a live database connection. Per-visual JSON, PDF and PNG UI actions are **Planned**.

## 13. Settings and themes

- Preview/query row limits, auto-save, Copilot sharing level and maximum sample rows.
- Open VS Code Settings action and inline sensitive-data warning.
- Project theme name, primary color, dashboard background and comma-separated chart palette.

Status: **Available**.

## 14. GitHub Copilot integration

- `@bi` chat participant with `/sql`, `/analyze`, `/report` and `/visual` commands.
- `#biProjectSchema` for raw-row-free semantic metadata.
- `#biQuery` for confirmed bounded read-only queries allowed by the sharing setting.
- `#biCreateReport` for confirmed report/first-page creation with exact returned IDs.
- `#biConfigureVisual` for confirmed create/update after schema parsing and real query validation.
- Tool-result loop feeds exact success/error JSON back to the selected model; instructions prohibit unproven claims of application.

Status: **Available** when VS Code exposes an eligible language model. The extension bundles no Copilot subscription, model, API key or proxy. Copilot cannot currently apply measures or transformation recipes.

## 15. Errors, logging and help

- Started/finished/failed operation state and non-blocking success/error toasts.
- Persistent workbench error banner with sanitized message.
- `BI Workbench` output channel with timestamps and stack traces, excluding credentials/raw result rows.
- Cancel action for an active query and rollback for failed import/transformation mutations.
- Help screen with the complete first workflow, current limits, full packaged README, Settings and Logs actions.

Status: **Available**.
