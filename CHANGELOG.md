# Changelog

All notable changes to BI Workbench are documented here.

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
