# Architecture

## Runtime boundaries

```text
VS Code
├─ Extension host (trusted workspace, Node.js)
│  ├─ ExtensionController: commands, validated webview requests, operation state
│  ├─ ProjectStore: create/open/migrate/validate/atomically save JSON metadata
│  ├─ ProjectManager: semantic mutations and pre-commit validation
│  ├─ DuckDbEngine: persistent local OLAP database and bounded/cancellable queries
│  ├─ ImportService: transactional local-file and database ingestion
│  ├─ TransformationService: typed recipe -> deterministic transactional SQL
│  ├─ ReportService: visuals + filters + relationships -> bounded read-only SQL
│  ├─ Explorer sidebar trees, exports, logs and settings
│  └─ Copilot participant/tools with privacy and confirmation boundaries
└─ Webview (browser sandbox)
   ├─ Home/import/data/query/transform/model/measures/reports/settings/help
   ├─ Editable report and semantic-model forms
   ├─ ECharts renderers and interactive slicers
   └─ Runtime-validated message bridge; no direct filesystem/database access
```

The webview is deliberately unprivileged. It renders a host-owned state snapshot and emits typed intentions. Every request is parsed with Zod, every referenced table/field/report/page is revalidated in the extension host, and only the host writes project metadata or DuckDB data.

## Module map

| Module | Responsibility |
| --- | --- |
| `src/shared/project.ts` | Versioned project schemas, v1-to-v2 migration and domain types |
| `src/shared/messages.ts` | Discriminated host/webview protocol |
| `src/core/projectStore.ts` | Atomic JSON persistence and migration backup |
| `src/core/importService.ts` | CSV/JSON/Parquet/XLSX/DuckDB/SQLite ingestion |
| `src/core/transformationService.ts` | Validated transformation pipeline compiler |
| `src/core/projectManager.ts` | Transaction boundary for tables, relationships, measures, reports and visuals |
| `src/core/reportService.ts` | Visual-query planning and relationship-aware filters |
| `src/copilot/*` | Privacy-scoped context, participant tool loop and registered tools |
| `src/webview/*` | Pure HTML rendering, event handling, CSS and ECharts options |

## On-disk project and schema migration

```text
my-project/
├─ project.bi.json                         # reviewable schema-v2 metadata
├─ project.bi.v1.backup-<timestamp>.json   # created once when migrating v1
└─ .bi-workbench/
   └─ data.duckdb                          # imported/derived data; gitignored
```

Schema v2 adds table/column presentation, report/page descriptions, complete visual configuration and a project theme. On open, the store:

1. parses the JSON and identifies its schema version;
2. rejects unknown versions;
3. migrates v1 in memory through a typed mapping;
4. creates an exclusive sibling backup of the original;
5. atomically writes the validated v2 document.

Normal writes use a sibling temporary file opened with restrictive permissions, flush it, and rename it over the target. Project metadata contains no credentials. Source paths are relative when they remain inside the project directory.

## Import boundary

- DuckDB performs bulk CSV, JSON and Parquet reads and copies base tables from DuckDB sources.
- XLSX is parsed offline and every non-empty worksheet is copied transactionally.
- SQLite headers are detected before `.db` dispatch. Bundled `sql.js` opens the source from bytes, enumerates user tables, and streams JSONL batches into controlled DuckDB imports. The source bytes are never written, and imports above 512 MiB are refused because the portable reader loads the file in memory.
- Target identifiers are normalized and made unique. Display names remain in semantic metadata.
- Each imported file/database is handled through a DuckDB transaction. Failure rolls back the target copies and leaves source files untouched.

## Query, transformation and visualization flow

1. A visual references a real project table, optional measure, physical fields and persisted display/configuration options.
2. `ProjectManager.upsertVisual` parses the complete visual schema and asks `ReportService` to execute its bounded query before committing metadata.
3. `ReportService` validates table fields, measure ownership, aggregation, series compatibility and sort fields.
4. Page filters and temporary chart/slicer filters are compiled into parameters. Same-table filters become direct predicates.
5. For another table, the planner finds active relationship paths whose direction permits filter flow. A unique shortest path becomes nested correlated `EXISTS` predicates; an ambiguous equal-length path is rejected rather than guessed.
6. DuckDB returns JSON-safe bounded rows. The host sends only those rows to the webview.
7. ECharts renders charts and sends category clicks back as temporary filters. The host recomputes the full page.

User queries are restricted to one bounded read-only statement. The query UI can call DuckDB interruption; the host also enforces a timeout. Internal transformations use quoted identifiers and controlled templates to create a replacement table transactionally.

## GitHub Copilot flow

1. The user explicitly invokes `@bi` or references a BI tool in VS Code Chat.
2. The extension builds only the context allowed by `biWorkbench.copilotDataSharing`; `schema` is the default and contains no raw rows.
3. The participant selects the model chosen by the user and offers only the four BI Workbench tools to it.
4. Text is streamed to Chat. Tool calls are limited to four rounds, invoked through `vscode.lm.invokeTool`, and their exact structured result is fed back to the model.
5. `#biProjectSchema` is read-only. `#biQuery` is read-only, bounded and confirmation-gated, and remains disabled in schema-only mode.
6. `#biCreateReport` and `#biConfigureVisual` require explicit VS Code confirmation. The visual tool executes the real visual query before saving. Imported source files are never changed by either tool.

This is Copilot-compatible through public VS Code APIs; it does not bundle GitHub credentials, a model entitlement, an API key or a proxy.

## Core invariants

1. Parse on every project open and before every project write.
2. Back up before schema migration and write metadata atomically.
3. Serialize DuckDB work through one active embedded connection with bounded results.
4. Reject ad-hoc file readers, attach/install/load/copy commands, multiple statements and writes.
5. Validate every model/report mutation against live schema and execute measure/visual previews before commit.
6. Roll back failed imports and transformations.
7. Keep the webview outside the filesystem/database trust boundary.
8. Keep Copilot context schema-only by default and make write tools confirmation-gated.
9. Exclude credentials and raw data rows from logs.

## Technology choices

- **DuckDB instead of a backend service:** embedded OLAP, joins, aggregation, persistence and bulk readers without server administration.
- **Bundled `sql.js` for SQLite:** deterministic offline availability and read-only source handling; the explicit memory ceiling is preferable to an implicit network download of a DuckDB extension.
- **Vanilla TypeScript webview:** small idle surface, direct VS Code theming and testable pure render functions.
- **Apache ECharts:** permissive license, Canvas rendering, multi-series charts, interactions and accessibility descriptions.
- **JSON metadata plus DuckDB data:** Git-reviewable definitions while keeping potentially sensitive imported rows out of Git by default.
- **VS Code Language Model APIs:** provider selection and confirmations remain in the host product; BI Workbench stores no AI credential.

## Resource profile and extension points

There is no background server. One embedded DuckDB connection is open for the active project, operations are serialized and the engine is limited to at most four worker threads. The webview exists only while opened. Preview, query, visual, export and Copilot payloads are bounded.

New connectors, transformations and visual types each require a schema variant, a host-side validator/compiler, tests and an explicit security review. A future PBIR/TMDL adapter must remain isolated and use only documented public schemas.
