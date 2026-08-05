# Complete user-interface inventory

This is the product-level interface map for v0.3.0. **Available** means the control invokes real host behavior and persists, queries or exports real project state. **Partial** names the exact smaller workflow. **Planned** is not presented as an enabled control.

## 1. Explorer sidebar and project explorer

- BI Workbench views embedded directly in the standard VS Code Explorer sidebar, matching the placement used by Excel AI & VBA Studio.
- **Project** tree: tables with row counts, sources with formats and saved queries.
- **Semantic Model** tree: tables, physical/display columns, relationships and measures.
- **Reports** tree: reports, pages and visuals.
- Title actions for open workbench, import, save and Power BI export from the Reports tree.
- Empty-state create/open actions and Explorer action for `*.bi.json`.

Status: **Available**. Fine-grained node context menus are **planned**.

## 2. Main authoring shell

- Compact title bar with BI Workbench identity, active-project/saved state and New/Open/Save controls.
- Home/Insert/Modeling/View/Help command tabs and grouped actions for data, queries, visuals, measures, relationships, Power BI export and Copilot.
- Narrow left work-area rail ordered Report, Data, Model, Query, Transform, Import, Measures, Home, Settings and Help.
- Report mode with report tabs, a central scrollable dashboard canvas, page tabs and a right inspector.
- Right inspector contains functional Filters, Visualizations, Data/fields and Page settings panes. It scrolls vertically without forcing the report canvas to move.
- VS Code light/dark theme variables, responsive breakpoints, keyboard focus states and compact hover/focus visual actions.

Status: **Available**. The layout follows familiar BI authoring conventions but uses original BI Workbench code, identity, glyphs and styling; it does not include Microsoft assets.

## 3. Home screen

- Local/private execution identity, active project name and saved/dirty indicator.
- Create/open/save actions and recent-project list.
- Quick routes for import, query, reports, Power BI export and `@bi`.
- Project counts for tables/rows, relationships, measures, reports and pages.
- Links to Settings, packaged help and the output log.

Status: **Available**. On-disk database-size telemetry is **planned**.

## 4. Import center

- Multi-file picker for `.csv`, `.tsv`, `.json`, `.jsonl`, `.ndjson`, `.xlsx`, `.parquet`, `.duckdb`, `.sqlite`, `.sqlite3` and `.db`.
- `.db` files are dispatched by header: SQLite magic uses the portable SQLite reader; otherwise the DuckDB connector is attempted.
- CSV/JSON/Parquet type inference, every non-empty XLSX sheet, every DuckDB base table and every SQLite user table, including empty tables.
- Transactional target copy, normalized unique identifiers, preserved display names, busy state, row counts and actionable errors.
- PostgreSQL/MySQL/ODBC cards are visible as **Planned** and disabled.

Status: local file/database imports are **Available**. SQLite is read-only and capped at 512 MiB. Pre-import data preview, worksheet selection, append/replace policy and server connectors are **Planned**.

## 5. Data preview and profiling

- Table selection from navigation/tree.
- Bounded scrollable grid with sticky typed headers and truncation-safe cells.
- Row count, null count, distinct count, minimum, maximum and numeric mean.
- Explicit warning when the preview limit is reached.

Status: **Available**. Pagination, cell editing, grid sorting/filtering, histograms and selection-to-visual are **Planned**.

## 6. Query editor

- DuckDB SQL editor with Run and Cancel controls, execution duration and result-bound warning.
- Schema sidebar with quoted-field insertion.
- Read-only mode indicator, sanitized inline error, detailed output log, saved-query name/list and reload.
- Formula-safe CSV and JSON result export.

Status: bounded read-only `SELECT`/`WITH` execution, timeout and DuckDB interruption are **Available**. Query history and SQL language-service diagnostics are **Planned**.

## 7. Cleaning and transformations

- Source/target selectors and ordered recipe list.
- Select columns, rename, cast, filter, fill null, deduplicate and sort.
- Exact or substring replacement.
- Year/quarter/month/week/day/day-of-week/hour extraction into a named column.
- Group-by columns plus one or more parsed aggregate definitions.
- Clear/remove steps and apply to a transactional derived table.
- Failure retains the previous valid table and reports the exact operation.

Status: the listed transformations are **Available**. Join/merge, split, pivot/unpivot, step drag ordering, preview diff, fuzzy matching and custom scripts are **Planned**.

## 8. Semantic model and table presentation

- Table selector, physical name, editable display name and description.
- Per-column physical/display name, description, semantic type, default display format and hidden flag.
- Model summary cards using configured labels.
- Relationship create/edit/delete: source/target table and column, cardinality, single/both filter direction and active flag.
- Host validation for referenced objects, compatible types, duplicate relationships and invalid self-reference.

Status: presentation metadata and relationship editing are **Available**. Active relationships drive direction-aware filter propagation across unique multi-hop paths. A draggable diagram canvas is **Planned**.

## 9. Measures and calculations

- Create and edit name, description, home table, number format and DuckDB SQL aggregate expression.
- Cancel editing, delete and reuse in visuals.
- Execute a bounded validation query before commit and show a preview value.

Status: **Available**, limited to safe SQL aggregate expressions. The local runtime is not DAX. Power BI export translates only conservative aggregate patterns and reports every omitted measure.

## 10. Report manager

- Report/page tabs with add/delete, active selection and saved/dirty state around the central canvas.
- Right-side filter builder, visual builder, field tree and collapsible report/page settings.
- Expandable report/page settings for editable names and descriptions.
- Deterministic responsive 12-column dashboard grid.
- Visual create/edit/duplicate/delete, move-left/right, drag reorder and persisted width/height fields.
- Export active page, export the complete Power BI project and clear temporary interactions.

Status: **Available**. Pixel-free placement, mouse resize handles and undo/redo are **Planned**.

## 11. Visual builder and renderers

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

## 12. Filters, slicers and visual interactions

- Page-filter bar with table, column, operator, value and optional second value.
- Operators: equals, not equals, contains, greater/less than, inclusive comparisons, between, is null and is not null.
- Active filter chips, individual removal and clear temporary interactions.
- Categorical slicer buttons and chart-category clicks.
- Per-visual interaction mode `filter` or `none`.
- Same-table predicates and related-table propagation along direction-compatible active relationships.

Status: **Available**. If two equally short relationship paths could propagate a filter, the query fails with an ambiguity error rather than choosing silently.

## 13. Export

- Query results to CSV or JSON.
- Individual visual data to CSV.
- Active report page to standalone HTML with bounded data and dependency-free table/KPI/SVG/CSS renderers.
- Complete Power BI Desktop Project to a new folder: `.pbip`, PBIR report items, TMDL semantic model/relationships/measures, interactive supported visuals and full CSV table copies.
- Sensitive-data confirmation, collision-free destination naming, staging write and no-overwrite policy.
- Short deterministic internal names plus a 240-character generated-path safety check for Power BI Desktop on Windows.
- Project metadata remains JSON; imported/derived data remains DuckDB.

Status: **Available** for the listed formats. HTML is a static snapshot. PBIX is not generated directly; Power BI Desktop opens PBIP and performs Save As. Saved page filters, unsupported SQL measures and advanced formatting are reported rather than silently approximated. Per-visual JSON, PDF and PNG UI actions are **Planned**.

## 14. Settings and themes

- Preview/query row limits, auto-save, Copilot sharing level and maximum sample rows.
- Open VS Code Settings action and inline sensitive-data warning.
- Project theme name, primary color, dashboard background and comma-separated chart palette.

Status: **Available**.

## 15. GitHub Copilot integration

- `@bi` chat participant with `/sql`, `/analyze`, `/report`, `/visual` and `/powerbi` commands.
- `#biProjectSchema` for raw-row-free semantic metadata.
- `#biQuery` for confirmed bounded read-only queries allowed by the sharing setting.
- `#biCreateReport` for confirmed report/first-page creation with exact returned IDs.
- `#biConfigureVisual` for confirmed create/update after schema parsing and real query validation.
- `#biExportPowerBI` for confirmed PBIP/PBIR/TMDL export. It accepts no model-provided path; VS Code collects the destination locally and does not return the absolute path to the model.
- Tool-result loop feeds exact success/error JSON back to the selected model; instructions prohibit unproven claims of application.

Status: **Available** when VS Code exposes an eligible language model. The extension bundles no Copilot subscription, model, API key or proxy. Copilot cannot currently apply measures or transformation recipes.

## 16. Errors, logging and help

- Started/finished/failed operation state and non-blocking success/error toasts.
- Persistent workbench error banner with sanitized message.
- `BI Workbench` output channel with timestamps and stack traces, excluding credentials/raw result rows.
- Cancel action for an active query and rollback for failed import/transformation mutations.
- Help screen with the complete first workflow, current limits, full packaged README, Settings and Logs actions.

Status: **Available**.
