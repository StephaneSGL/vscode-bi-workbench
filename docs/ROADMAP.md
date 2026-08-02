# Release scope and roadmap

## v0.2.0 — configurable local BI workbench

The release is considered usable only when its automated suites, real-browser QA, clean Extension Host, packaged VSIX and installed identity all pass.

Completed scope:

- Schema-v2 project format with deterministic v1 migration and pre-migration backup.
- Editable table and column presentation: names, descriptions, visibility, semantic types and formats.
- CSV/TSV, JSON/JSONL/NDJSON, Parquet, XLSX, DuckDB and read-only SQLite imports; `.db` header detection; transactional copies.
- Bounded/cancellable read-only SQL, saved queries, profiles and CSV/JSON export.
- Transactional transformations: select, rename, cast, filter, fill-null, deduplicate, sort, exact/substring replace, date parts and group/aggregate.
- Editable validated relationships and SQL aggregate measures.
- Direction-aware, multi-hop relationship filter propagation with ambiguity rejection.
- Editable report/page names and descriptions.
- Visual create/edit/duplicate/delete/reorder, arrow and drag ordering, configurable 12-column width and height.
- Table, KPI, bar, horizontal bar, line, area, pie, donut, scatter and slicer renderers.
- Multi-series queries, category/value/custom-field sorting, colors, backgrounds, report themes, legend placement, labels, smoothing, number/currency/percent formatting and accessible descriptions.
- Page filters, chart/slicer interactions, temporary chips and clear-interaction action.
- Query CSV/JSON, per-visual CSV and standalone static HTML exports.
- `@bi` participant with a bounded tool loop; schema/query tools plus confirmation-gated report creation and validated visual application.
- Unit, integration, DOM UI, Chromium, Extension Host, package, install, dependency, license and secret-scan gates.

Explicit v0.2 limits:

- Windows x64 is the only packaged/installed platform with release evidence.
- No server database connector, join/pivot designer, cross-table measure planner, map, undo/redo, freeform pixel canvas or PDF/PNG export.
- No PBIX, DAX, Power Query M or Power BI tenant compatibility.

## v0.3 — data shaping and delivery

- PostgreSQL connector with TLS configuration, cancellation and VS Code SecretStorage credentials.
- Join/merge, split, pivot/unpivot and step reordering with preview/diff.
- Query history, richer SQL diagnostics and virtualized large-result grid.
- PNG/PDF export through deterministic browser rendering.
- Undo/redo transaction journal for semantic and report edits.
- Mouse resize handles and keyboard-accessible grid placement.
- Conditional formatting, annotations, combo/waterfall/treemap/heatmap/funnel/histogram visuals.
- Copilot tools for validated measure creation and transformation-plan preview/apply.
- Signed artifacts and Marketplace/Open VSX publication preparation.

## v0.4 — connectors and reusable assets

- MySQL and ODBC connectors with the same credential and threat-model gates.
- Parameterized sources, refresh recipes, incremental cache policies and CLI/CI refresh.
- Reusable visual templates and importable report themes.
- Row-level project policies with a documented local enforcement model.
- Optional PBIR/TMDL adapter based only on Microsoft-published schemas.

## v1.0 criteria

- Stable public project schema with forward migration guarantees and recovery tests.
- Packaged Extension Host and installation validation on Windows, Linux and macOS.
- Connector threat model, credential lifecycle and transport-security audit.
- Large-data benchmarks, cancellation coverage, memory ceilings and corruption recovery.
- Accessibility audit, keyboard-complete report editing and localization.
- Reproducible signed releases, documented extension API and no unsupported feature represented as complete.
