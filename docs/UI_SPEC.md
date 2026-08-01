# Complete user-interface inventory

This document is the product-level interface map. **Available** means the control works in v0.1.0. **Partial** means a smaller, explicitly described workflow works. **Planned** means it is documented but not presented as an enabled feature.

## 1. Activity Bar and project explorer

- BI Workbench Activity Bar icon.
- **Project** tree: imported/derived tables with row counts, source files with format, and saved queries.
- **Semantic Model** tree: tables, columns, relationships, and measures.
- **Reports** tree: reports, pages, and visuals.
- Title actions: open workbench, import, save.
- Empty-state actions: create or open a project.
- Explorer context action to open a `*.bi.json` project file.

Status: **Available** for the three trees and navigation/title actions. Fine-grained tree context menus are **planned**.

## 2. Home screen

- Product header and local/private execution indicator.
- Create project and open project actions.
- Recent projects from VS Code workspace state.
- Quick-start cards: import data, run SQL, build a visual, ask `@bi`.
- Current-project state: persisted/dirty status, table/row, relationship, measure, report, and page counts.
- Dedicated settings and help pages; the help page links to the packaged README and logs.

Status: **Available**. Database file size is **planned**.

## 3. Import center

- Multi-file picker for `.csv`, `.tsv`, `.json`, `.jsonl`, `.ndjson`, `.xlsx`, `.parquet`, `.duckdb`, and `.db`. In v0.1, `.db` means a DuckDB database, not SQLite.
- Connector cards with exact support state. Unsupported future connectors are labelled and disabled.
- CSV/JSON/Parquet type inference, all non-empty XLSX worksheets, and all base tables from a DuckDB file.
- Busy indicator, success/error feedback, row counts after import, and actionable log details.
- Duplicate target-name handling and safe identifier normalization.

Status: **Available** for the listed local formats, including every non-empty XLSX worksheet. Pre-import preview, worksheet selection, append/replace options, and user cancellation are **planned**. PostgreSQL/MySQL/SQLite/ODBC are **planned** connectors.

## 4. Data preview and profiling

- Bounded scrollable grid with sticky headers.
- Type badge, null count, distinct count, minimum/maximum, and numeric mean.
- Horizontal scrolling and truncation-safe cell display.
- Truncation warning when the configured preview limit is reached.

Status: **Available** for bounded preview, schema, and summary profiling. Pagination, direct grid sort/filter, copy actions, selection-to-visual, and histograms are **planned**.

## 5. Query editor

- DuckDB SQL editor, Run control, 30-second host timeout, execution time, and bounded-result warning.
- Schema sidebar and insertion of quoted identifiers.
- Result grid, sanitized error message/log entry, saved-query name, and saved-query list.
- Export query result to CSV or JSON.
- Read/write mode indicator. User queries in v0.1 are restricted to read-only statements; imports and transformations use internal controlled writes.

Status: **Available**. Explicit user cancellation, query history, and SQL language-service diagnostics are **planned**.

## 6. Cleaning and transformations

- Source table selector and ordered transformation-step list.
- Supported v0.1 operations: select columns, rename column, cast type, filter predicate, fill null, remove duplicates, and sort.
- Explicit description of the deterministic CTE execution model.
- Apply creates or replaces a derived table in a transaction.
- Delete/clear steps and create a new derived table from the selected source.
- Error banner/log reports the failing operation and keeps the previous valid table.

Status: **Available** for the listed deterministic operations. Step reordering, visual diff, fuzzy matching, pivot/unpivot, merge, and custom scripts are **planned**.

## 7. Semantic model

- Table cards with columns and types.
- Relationship list/editor: from table/column, to table/column, cardinality, and filter direction.
- Validation: referenced objects exist and type families are compatible.
- Relationship metadata is exposed to Copilot so it can propose joins.
- Diagram canvas with draggable nodes is planned after v0.1; the first version uses a precise list/form interface.

Status: **Available** for relationship create/delete and validation. Relationship-aware report-query propagation and an interactive diagram are **planned**.

## 8. Measures and calculations

- Name, description, home table, format, and DuckDB SQL aggregate expression.
- Validate against a bounded generated query before save.
- Measure list and preview result.
- Measures are reusable in visuals.
- No claim of DAX compatibility.

Status: **Available**.

## 9. Report manager and dashboard canvas

- Report and page tabs, add/delete operations, and dirty/saved indicator.
- Responsive grid canvas.
- Add visual button and visual configuration form.
- Visual title, table source, category field, value field or measure, aggregation, chart type, table columns, and row/category limit.
- Visual removal and page-level clear-interactions action.

Status: **Available** with a responsive deterministic grid. Renaming, visual editing/duplication, per-visual data export, saved-query visual sources, and freeform drag/resize are **planned**.

## 10. Visualizations

- v0.1: table, KPI, vertical bar, horizontal bar, line, area, pie/donut, scatter, and categorical slicer.
- Tooltips, legend, accessible labels, theme adaptation, resize handling, and empty/error states.
- Later: combo, waterfall, treemap, heatmap, map, funnel, gauge, boxplot, histogram, and custom Vega-Lite specifications.

## 11. Filters, slicers, and interactions

- Page filter bar: table, column, operator, and value.
- Operators: equals, not equals, contains, greater/less than, between, is null, is not null.
- Slicer visual for distinct values.
- Clicking a chart category creates a temporary cross-filter for other visuals on the same page.
- Active-filter chips and Clear all.

Status: **Available** for page filters, clickable categorical slicers, chart clicks, temporary filter chips, and same-table recomputation. Relationship-propagated cross-filtering is **planned**.

## 12. Export

- Query/table data to CSV and JSON with spreadsheet-formula injection protection for CSV.
- Active report page to standalone HTML containing bounded exported data and dependency-free table/KPI/SVG/CSS renderers.
- Project metadata remains JSON and the data database remains DuckDB.
- PDF and PNG export follow later after deterministic browser rendering is validated.

Status: **Available** for CSV, JSON, and HTML. HTML is a static portable snapshot, not a live database connection. PDF and PNG are **planned**.

## 13. Settings

- Preview and query row limits.
- Auto-save.
- Copilot sharing level: schema, aggregates, or samples.
- Maximum Copilot sample rows.
- Open VS Code Settings button and inline privacy explanation.

Status: **Available**.

## 14. GitHub Copilot integration

- `@bi` chat expert with `/sql`, `/analyze`, `/report`, and `/visual` commands.
- Project-schema tool `#biProjectSchema`.
- Bounded read-only query tool `#biQuery`, governed by sharing settings.
- The selected Copilot/model provider performs inference; BI Workbench does not include an API key or proxy.
- Generated content is a proposal. It is never executed as a write automatically.

Status: **Available** when VS Code exposes a language model to the user. The extension does not bundle a Copilot subscription or model entitlement.

## 15. Errors, logs, and help

- Non-blocking toast for completed actions.
- Workbench error banner with operation, sanitized message, and recovery action.
- `BI Workbench` output channel with timestamps and stack traces; no raw row values or credentials.
- Import/query errors preserve the last valid project state.
- Help command opens the packaged README; settings and log commands remain available when no project is open.

Status: **Available**.
