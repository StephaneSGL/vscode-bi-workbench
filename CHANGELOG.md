# Changelog

All notable changes to BI Workbench are documented here.

## 0.3.0 — 2026-08-02

### Added

- Real Power BI Desktop Project export using Microsoft's documented PBIP shortcut, PBIR report and TMDL semantic-model formats.
- Complete local CSV copies of exported DuckDB tables with Power Query M import partitions and explicit sensitive-data confirmation.
- Semantic table/column presentation, relationships, active state, cardinalities, filter directions and conservative DuckDB SQL-to-DAX measure translation.
- PBIR generation for table, card, clustered column/bar, line, area, pie, donut, scatter and slicer visuals, including titles, deterministic layout and disabled-interaction mappings.
- `BI Workbench: Export Power BI Desktop Project (PBIP)`, webview export actions, `@bi /powerbi` and confirmation-gated `#biExportPowerBI`.
- Microsoft report-authoring validator pinned as a development-only dependency; integration coverage validates every supported visual role and remote JSON schemas.
- A compact BI authoring ribbon, Report/Data/Model rail, central report canvas, page/report tabs and right-side Filters/Visualizations/Data panes that follow VS Code light and dark themes.

### Fixed

- Generated Power BI item, table and visual paths now use short deterministic identifiers and enforce a 240-character Desktop safety budget before export.
- TMDL descriptions now use the documented `///` comment syntax instead of an invalid property form.
- Relationship endpoints/cardinalities are normalized to Power BI's many-to-one convention; one-to-one filters are exported bidirectionally with an explicit warning.
- PBIR pages use `FitToWidth`, KPI values scale to narrow cards and visual edit controls stay unobtrusive until hover/focus.
- Report rendering falls back safely while a legacy project state is being migrated and the inspector no longer exposes a horizontal scrollbar.

### Security

- The Copilot export tool cannot receive a filesystem path from the model. VS Code always asks the user to select the parent folder locally.
- Export writes to a fresh staging directory, refuses overwrite, then atomically renames the completed project into place.
- Tool results do not disclose the selected absolute path to the language model; errors redact local paths.

### Known limitations

- BI Workbench does not generate proprietary PBIX directly. Power BI Desktop must open PBIP and perform Save As.
- SQL-to-DAX translation is limited to safe aggregate patterns. Unsupported measures, unaggregated chart values and saved page filters are omitted with explicit warnings.
- Generated M partitions use absolute CSV paths; moving the export requires updating them.
- The smoke fixture opened and refreshed successfully in Power BI Desktop `2.156.951.0` on Windows x64. This does not establish universal compatibility with every Desktop version or unsupported feature.

## 0.2.0 — 2026-08-02

### Added

- Project schema v2 with safe v1 migration, sibling backup, report theme and complete semantic/visual presentation metadata.
- Read-only SQLite import through bundled `sql.js`, `.db` header detection and preservation tests for populated and empty tables.
- Replace, date-part and group/aggregate transformations.
- Editable table/column labels, descriptions, visibility, semantic types and formats.
- Editable relationships and measures; relationship-aware multi-hop filter propagation with direction and ambiguity validation.
- Report/page rename and descriptions; visual edit, duplicate, arrow/drag reorder, width/height configuration and per-visual CSV export.
- Multi-series charts, custom sorting, themes, colors/backgrounds, legend positions, data labels, smooth lines, accessible descriptions and numeric/currency/percent formatting.
- Explicit query cancellation through DuckDB interruption.
- Confirmation-gated Copilot tools to create reports and apply visuals after executing their real bounded query.
- Schema migration, relationship-filter, SQLite and end-to-end webview form regression tests.

### Changed

- Project, semantic-model and report trees now appear directly in the standard Explorer sidebar, matching the discoverable placement used by Excel AI & VBA Studio.
- The VS Code extension card now uses the BI Workbench color logo and a matching dark gallery banner.
- The `@bi` participant now runs a bounded language-model tool loop and feeds exact tool results back to the model.
- Visual action controls and KPI typography now adapt to narrow dashboard cards.
- ECharts uses its current outer-bounds layout API and disconnects resize observers before disposal.

### Security

- Schema-only Copilot context and the schema tool now omit saved-query SQL text and persisted filter values, while retaining safe query names and filter structure.
- SQLite staging files are created with restricted permissions and removed even when target transaction creation fails.
- Ad-hoc SQL now blocks reader/scanner aliases, network functions, engine metadata and secret access; Copilot aggregate sharing accepts only a conservative aggregate SELECT shape.

### Known limitations

- The v0.2.0 VSIX is validated on Windows x64 only.
- No PBIX, DAX, Power Query M, Power BI tenant, PostgreSQL/MySQL/ODBC, join/pivot designer, cross-table measure planner, map, undo/redo or PDF/PNG support.
- SQLite files above 512 MiB are refused by the memory-backed portable reader.

## 0.1.0 — 2026-08-01

### Added

- Local schema-versioned BI projects with atomic metadata writes and persistent embedded DuckDB storage.
- CSV/TSV, JSON/JSONL/NDJSON, Parquet, XLSX, and DuckDB import paths.
- Bounded previews, column profiles, read-only SQL, saved queries, and CSV/JSON result export.
- Transactional derived-table transformations.
- Relationship metadata and validated SQL aggregate measures.
- Interactive report pages with ten visual types, page filters, slicers, and same-table cross-filtering.
- Static standalone HTML report export.
- Activity Bar explorers, themed webview, settings, help, errors, and sanitized output logging.
- VS Code Chat participant and language-model tools with schema-first privacy controls.
- Unit, integration, DOM UI, browser-interaction, Extension Host activation, packaging, and installation validation.

### Known limitations

- The v0.1.0 VSIX is built and validated for Windows x64.
- No PBIX, DAX, Power Query M, Power BI tenant, or Microsoft proprietary-format compatibility.
- No cross-table report filtering, server database connectors, drag/resize canvas, or PDF/PNG export.
