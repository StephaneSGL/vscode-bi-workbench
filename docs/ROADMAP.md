# Release scope and roadmap

## v0.1.0 — local usable foundation

The release is complete only if all listed items pass automated tests and a packaged VSIX activation check.

- Create, open, validate, and atomically save a schema-versioned BI project.
- Persistent embedded DuckDB database.
- Import CSV/TSV, JSON/JSONL, Parquet, XLSX, and tables from a DuckDB file.
- Table schema, bounded preview, and column profiles.
- Read-only DuckDB SQL editor, saved queries, bounded results, timeout, and CSV/JSON export.
- Transformation recipes: select, rename, cast, filter, fill null, deduplicate, sort.
- Relationships with reference/type validation.
- Reusable SQL aggregate measures with validation.
- Reports/pages with table, KPI, bar, horizontal bar, line, area, pie/donut, and scatter visuals.
- Page filters, slicers, same-table chart cross-filtering, and active-filter chips.
- Standalone bounded HTML report export.
- Activity Bar project/model/report explorers.
- `@bi` Copilot participant and schema/read-only query tools with privacy levels.
- Output logs, actionable workbench errors, packaged help, and settings.
- Unit, integration, UI, extension activation, package, and installation checks.

The v0.1 schema is validated but has no migration from another released schema because this is the first schema version.

## v0.2

- Drag/resize dashboard grid with undo/redo and keyboard accessibility.
- Relationship-aware filter propagation and generated multi-table queries.
- SQLite and PostgreSQL connectors with VS Code SecretStorage credentials.
- More transformation operations: join, group, pivot/unpivot, split, replace, date parts.
- Chart theming, annotations, conditional formatting, and richer accessibility descriptions.
- PNG/PDF export through deterministic browser rendering.
- Signed release artifacts and Marketplace/Open VSX publication preparation.

## v0.3

- MySQL and ODBC connectors; optional Arrow/Parquet cache policies.
- Row-level project roles and parameterized data sources.
- Incremental refresh recipes and scheduled CLI/CI refresh.
- Reusable visual templates and report themes.
- Optional PBIR/TMDL import/export adapter based only on public Microsoft schemas.
- Copilot-generated report plans with explicit preview/diff/apply workflow.

## v1.0 criteria

- Stable project schema and migration guarantees.
- Cross-platform packaged validation on Windows, Linux, and macOS.
- Connector threat model and credential lifecycle audit.
- Large-data benchmarks, cancellation, memory ceilings, and recovery tests.
- Accessibility audit, localization, documented extension API, and reproducible releases.
- No unsupported feature represented as complete.
