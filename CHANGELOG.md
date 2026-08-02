# Changelog

All notable changes to BI Workbench are documented here.

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
