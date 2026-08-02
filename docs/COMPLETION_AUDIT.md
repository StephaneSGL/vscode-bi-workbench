# Completion audit against the product objective

Audit date: 2026-08-02. This is an engineering gate, not a marketing checklist.

The v0.3 objective is a functional VS Code BI application in which users can configure tables, calculations, charts, dashboards, filters and persistence, with Copilot-assisted query/report/visual workflows and documented Power BI Desktop Project export. “Proven” below means executable evidence exists for the exact stated scope; it does not imply Power BI parity or universal compatibility with every Desktop version and feature.

| Requirement | v0.3 evidence | Audit result | Remaining boundary |
| --- | --- | --- | --- |
| Install and run in VS Code | VSIX package, forced install, installed identity, native DuckDB load, SQLite WASM query, Extension Host open-command/webview-tab test | Proven on Windows x64 | Other platforms require separate native package and install evidence |
| Create/open/save projects | Atomic JSON store, schema-v2 validation, v1 migration and immutable pre-migration backup tests | Proven | No collaborative merge UI or remote project service |
| CSV, Excel, JSON and database import | Real generated CSV/JSONL/Parquet/XLSX/DuckDB inputs plus populated/empty SQLite source tests and source-byte preservation | Proven for listed local formats | PostgreSQL/MySQL/ODBC/cloud connectors not implemented |
| Query and data preview | Read-only SQL guard, bounded engine, timeout/interruption action, previews/profiles and export tests | Proven for v0.3 scope | No query history, language server or virtualized large grid |
| Repeatable cleaning/transformation | Ten deterministic variants with transactional integration coverage, including replace/date/group | Usable but bounded | Join/merge, split and pivot/unpivot remain planned |
| Semantic data model | Editable relationships; same-table, one-hop, multi-hop, direction and ambiguity report-filter tests | Proven for filter propagation | No diagram canvas or cross-table measure expression planner |
| Measures/calculations | Create/edit/delete, format and bounded aggregate preview through manager/UI tests | Proven for same-table SQL aggregates | Not DAX; visual and measure source table must match |
| Configurable tables | Column labels/descriptions/visibility/semantic type/format, table label/description, persisted order/selection and formatted rendering | Proven | No conditional formatting or direct grid cell editing |
| Configurable charts | Existing visual edit, duplicate, reorder, width/height, series, sorting, colors, background, legend, labels, smoothing and formats; real query pre-commit; ribbon/canvas/inspector UI reviewed in light and dark themes | Proven | No map/custom/combo family or freeform pixel canvas |
| Dashboard interactions | Page filters, slicers, chart clicks, per-visual interaction mode and relationship-aware recomputation | Proven for unique active paths | Ambiguous paths deliberately fail; no user join-path chooser |
| Report management | Add/delete/rename reports/pages; descriptions; visual edit/duplicate/delete and keyboard/drag ordering | Proven for deterministic grid | No undo/redo or mouse resize handles |
| Export | Query CSV/JSON, per-visual CSV, static HTML, complete CSV table copy, PBIP shortcut, TMDL semantic model and PBIR reports | Proven for generated structure, PBIR schemas/catalog and the tested Desktop fixture | Direct PBIX generation and PBIP-to-PBIX Save As are not claimed; no PDF/PNG |
| GitHub Copilot assistance | Five tools declared and registered; participant tool loop; report/visual application plus path-isolated, confirmation-gated Power BI export | Proven at registration and implementation level | Invocation requires a Chat-issued tool token and user-owned model session; measure/transform apply tools remain planned |
| Privacy and security | Workspace Trust, schema-only default, bounded read-only guard, write-tool confirmations, no telemetry, dependency/license/secret scans | Proven for current paths | Every future server connector needs credential/TLS threat-model work |
| Power BI format validation | Synthetic two-table model, relationship, safe DAX translation and all ten visual types; Microsoft `powerbi-report-author` validator; real open, relationship update and CSV refresh in Power BI Desktop `2.156.951.0` | Proven for the documented v0.3 fixture with zero PBIR errors and no Desktop error dialog | Future Desktop/schema revisions and unsupported visuals/filters still require adapter tests |
| Automated and visual verification | 47 automated tests, repeated package validation, Chromium light/dark review with zero console errors, Extension Host, archive audit, forced install and installed DuckDB/SQLite queries | Proven locally for v0.3 | Public Windows CI remains a separate gate and is recorded in `TEST_REPORT.md` |
| Public source and delivery | Public repository, v0.2 branch and draft PR #1; v0.3 changes remain on the same review branch until final push/CI | Source is public; v0.3 CI pending at this audit edit | PR remains intentionally unmerged; Marketplace/Open VSX publication is not claimed |

## Release decision

The product is a usable local BI workbench for its documented v0.3 scope. Power BI project export is implemented as a real file-generation path rather than a branding-only action: complete data, semantic metadata and report definitions are written and validated.

The project must still describe direct PBIX generation, PBIP-to-PBIX Save As evidence, server connectors, advanced shaping, cross-table measures, undo/redo and full Power BI interoperability as absent. The successful Desktop smoke fixture is deliberately not generalized beyond the tested v0.3 subset. Those omissions prevent any claim of feature parity with Power BI or a universal database platform.
