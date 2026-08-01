# Architecture

## Runtime boundaries

```text
VS Code
├─ Extension host (trusted workspace, Node.js)
│  ├─ ProjectStore: create/open/validate/atomically save project metadata
│  ├─ DuckDbEngine: persistent local OLAP database and bounded queries
│  ├─ ImportService: controlled bulk file/database ingestion
│  ├─ TransformationService: validated pipeline -> transactional SQL
│  ├─ ReportService: filters/measures/visual specifications -> read-only SQL
│  ├─ Tree providers and commands
│  └─ Copilot participant/tools with privacy policy enforcement
└─ Webview (browser sandbox)
   ├─ Workbench navigation and forms
   ├─ Result/preview grids
   ├─ ECharts renderers
   └─ Typed message bridge; no direct filesystem or database access
```

The webview is intentionally unprivileged. Every mutation is parsed and validated in the extension host. DuckDB and the project store never trust HTML state as authoritative.

## On-disk project

```text
my-project/
├─ project.bi.json        # versioned, reviewable semantic/report metadata
└─ .bi-workbench/
   ├─ data.duckdb         # imported/derived local data (gitignored by default)
   └─ exports/            # optional generated files
```

`project.bi.json` contains source descriptors, transformation recipes, relationships, measures, saved queries, reports, pages, visuals, and filters. It contains no passwords or access tokens. Source paths are stored relative to the project directory when possible.

## Core invariants

1. The JSON project is validated with a versioned schema on every open and before every save.
2. Project writes are atomic: write a sibling temporary file, fsync/close, then replace.
3. User-facing queries are one read-only `SELECT`, `WITH`, `DESCRIBE`, `SHOW`, or `EXPLAIN` statement and receive a server-side limit.
4. Internal writes use controlled SQL templates, quoted identifiers, escaped literal paths, and transactions.
5. Transformations create a temporary replacement table and swap only after successful validation.
6. Webview messages are discriminated and runtime validated.
7. The Copilot boundary defaults to schema-only context. Raw values require an explicit setting.
8. Logs exclude credentials and raw data rows.

## Query and visualization flow

1. A visual references a table or saved query plus field/measure metadata.
2. `ReportService` validates referenced objects against the active schema.
3. Page filters and temporary chart interactions are compiled to parameterized predicates.
4. A bounded DuckDB query returns JSON-safe values.
5. The extension posts only that bounded result to the webview.
6. ECharts renders and emits category-click events; the host recomputes affected visuals.

## GitHub Copilot flow

1. The user explicitly invokes `@bi` or references a BI tool in Chat.
2. The extension builds context allowed by `biWorkbench.copilotDataSharing`.
3. The model selected in the VS Code Chat model picker receives a system-style domain instruction, schema, and the user's request.
4. Output is streamed into Chat. SQL and report specifications are presented as reviewable proposals.
5. The read-only query tool applies SQL safety checks, output bounds, and privacy policy before returning results.

## Technology choices

- **DuckDB rather than a separate backend service:** real OLAP behavior, joins, aggregations, persistent storage, and bulk file readers with low operational overhead.
- **Vanilla TypeScript webview rather than a framework runtime:** smaller VSIX and lower idle memory for v0.1. The view layer is componentized into pure render/config functions and can move to a framework later.
- **ECharts:** permissive license and broad interactive chart coverage.
- **JSON metadata + DuckDB data:** Git-friendly definitions without committing potentially sensitive imported data by default.
- **VS Code native AI APIs:** no embedded API key, no private proxy, and compatibility with the model selected by the user.

## Extension points

- New import connectors implement a narrow `DataConnector` interface.
- New transformations implement schema validation plus a deterministic SQL compiler.
- New visuals add one specification variant and one renderer adapter.
- PBIR/TMDL support, if developed, remains an optional adapter module and never contaminates the independent project model.

## Resource profile

The extension has no background server. The extension host opens one embedded DuckDB connection for the active project, serializes database operations, and limits DuckDB to at most four worker threads. The webview is created only when the workbench is opened. Query, preview, visual, and Copilot-result sizes are bounded before crossing the extension/webview or extension/model boundary.
