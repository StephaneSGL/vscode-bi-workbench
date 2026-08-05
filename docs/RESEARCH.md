# Existing solutions and technical positioning

Research updated: 2026-08-02.

BI Workbench is an independent, local-first VS Code extension. It is not a Microsoft product and does not reuse Microsoft Power BI code, assets, or branding.

## Existing VS Code solutions

| Solution | What it does well | Gap relative to this project |
| --- | --- | --- |
| [Microsoft Data Wrangler](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.datawrangler) | Rich tabular preview, column profiling, filters, transformations, generated Pandas code, CSV/Parquet/Excel/JSONL entry points, and Copilot-assisted operations. | Data preparation rather than a persisted semantic model, multi-visual report canvas, cross-filtering, or dashboard project format. It also requires Python/Jupyter for its local runtime. |
| [Microsoft TMDL extension](https://marketplace.visualstudio.com/items?itemName=analysis-services.TMDL) | Language services for TMDL, embedded DAX, and Power Query: highlighting, completion, diagnostics, formatting, and code actions. | Edits model source; it is not a standalone local BI runtime or dashboard designer. |
| [Power BI Studio](https://marketplace.visualstudio.com/items?itemName=GerhardBrueckl.powerbi-vscode) | Browses Power BI tenants, calls REST APIs, works with TMDL/XMLA, and runs DAX notebooks. | Primarily manages existing Microsoft/Fabric assets and requires tenant authentication and, for some operations, capacity/licensing. It is not an independent local report engine. |
| [SQLTools](https://marketplace.visualstudio.com/itemdetails?itemName=mtxr.sqltools) with the [DuckDB driver](https://marketplace.visualstudio.com/items?itemName=Evidence.sqltools-duckdb-driver) | Database explorer, SQL editing, result grids, and DuckDB connections. | Query-centric; it does not provide an integrated semantic model, measures, report pages, or cross-filtered dashboards. |
| [DuckDB for VS Code](https://marketplace.visualstudio.com/items?itemName=chuckjonas.duckdb) | Direct queries over CSV, Parquet, JSON, Excel, DuckDB, and several remote sources, plus schema exploration and results. | Strong data explorer, but not a complete BI project/report authoring environment. |
| [Power BI Desktop projects (PBIP/PBIR/TMDL)](https://learn.microsoft.com/en-us/power-bi/developer/embedded/projects-enhanced-report-format) | Source-control-friendly report and semantic-model definitions. PBIR is publicly documented and editable by non-Power-BI tools. | Power BI Desktop remains the official renderer/converter for PBIX/PBIP workflows, and format/version constraints remain Microsoft-controlled. |

## Relevant open-source building blocks

| Component | Selection | Reason | License |
| --- | --- | --- | --- |
| Analytical database | [DuckDB Node API](https://www.npmjs.com/package/@duckdb/node-api) | Embedded OLAP SQL engine; no separate server; persistent single-file database; native Promise API; Windows, Linux, and macOS binaries. | MIT |
| Portable SQLite reader | [`sql.js`](https://github.com/sql-js/sql.js/) | Bundles SQLite compiled to WebAssembly, opens source bytes read-only in the extension workflow, and avoids depending on a runtime extension download. | MIT |
| File ingestion | [DuckDB CSV/JSON readers](https://duckdb.org/docs/current/data/overview) and [XLSX reader](https://duckdb.org/docs/current/guides/file_formats/excel_import) | Type inference and bulk ingestion without a Python service. XLSX is supported; legacy XLS is not. | MIT (DuckDB) |
| Visualizations | [Apache ECharts](https://echarts.apache.org/en/) | Mature Canvas/SVG rendering, interaction events, accessibility options, and more than twenty chart families. | Apache-2.0 |
| Extension UI | VS Code webview + theme variables | Full control over a report canvas while matching the host theme and keeping data local. | VS Code API terms; project code MIT |
| AI integration | [VS Code Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat) and [Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools) | Official extension points for an `@bi` expert and explicit schema/query tools usable by GitHub Copilot. | VS Code API terms |
| Power BI report validation | [`@microsoft/powerbi-report-authoring-cli`](https://www.npmjs.com/package/@microsoft/powerbi-report-authoring-cli) | Official public-preview catalog and PBIR conformance validator; pinned and used only in development/tests. | MIT |
| Validation | Zod | Runtime validation for project metadata and webview messages; future schema versions can add explicit migrations. | MIT |

The v0.3 release fixture is validated at two distinct boundaries: the Microsoft PBIR catalog/schema validator reports zero errors, and Power BI Desktop `2.156.951.0` on Windows x64 opens the PBIP, accepts the generated relationship update and refreshes the local CSV partitions. This is evidence for the implemented subset, not a promise of compatibility with all future Desktop schemas.

## Capabilities comparable to general BI software

The goal is functional similarity at the workflow level, not binary or visual compatibility with Power BI.

### Technically reasonable to implement independently

- Import CSV, JSON, XLSX, DuckDB, SQLite, and selected future databases through documented connectors.
- Local SQL query editor, result preview, profiling, and repeatable transformation steps.
- Tables, typed columns, relationships, and original SQL-based measures.
- Report pages, interactive charts, tables, KPI cards, filters, slicers, and cross-filtering.
- Project persistence in a documented JSON format plus a DuckDB data file.
- CSV, JSON, and self-contained HTML report export.
- Documented PBIP/PBIR/TMDL export with generated local M partitions and a deliberately small SQL-to-DAX translation set.
- Source control, deterministic project files, schema validation, and explicit versioning.
- Copilot assistance through documented VS Code APIs, with explicit privacy controls.

### Possible later, with important constraints

- PostgreSQL, MySQL, ODBC, and cloud warehouses: each connector needs credential storage, cancellation, TLS, and driver-specific tests.
- Broader PBIP/PBIR/TMDL interoperability: v0.3 implements a validated subset, but future Microsoft schema changes, advanced visuals, filters, themes and refresh definitions still require versioned adapters.
- Power BI REST/Fabric integration: requires Microsoft identity, tenant permissions, API throttling handling, and the user's applicable Microsoft licensing. The [Power BI REST API documentation](https://learn.microsoft.com/en-us/rest/api/power-bi/) describes those permissions and service boundaries.
- Row-level security, incremental refresh, scheduled refresh, and shared deployments: these require a security model and usually a server/runtime.

### Explicitly out of scope

- Copying Power BI source code, visual design, icons, product name, or proprietary behavior.
- Reading or writing the undocumented internals of PBIX files.
- Claiming general DAX or Power Query compatibility. BI Workbench uses DuckDB SQL locally and only generates a constrained, audited DAX/M subset during Power BI export.
- Bundling Microsoft credentials, tenant data, proprietary visuals, or paid Microsoft services.

## Legal and naming guardrails

- The product name is **BI Workbench**, not “Power BI for VS Code”. “Power BI” appears only in factual comparison and interoperability documentation.
- No Microsoft or Power BI logo, color lockup, screenshot, copied layout, or source is included.
- Dependencies are permissively licensed; their notices are recorded in `THIRD_PARTY_NOTICES.md`.
- The project format and implementation are original. PBIR/TMDL support is isolated in one adapter based only on Microsoft-published schemas and documentation.
- This is an engineering risk assessment, not legal advice. A trademark/licensing review is still appropriate before commercial distribution.

## SQLite implementation decision

DuckDB documents a SQLite extension, but extension autoload can require a network download in a fresh installation. BI Workbench v0.2 instead bundles permissively licensed `sql.js` and copies user tables into DuckDB transactionally. This makes offline behavior testable and leaves the source untouched. The tradeoff is explicit: `sql.js` loads the database into memory, so the connector rejects sources above 512 MiB and recommends Parquet or DuckDB for larger inputs.

## Conclusion

Existing extensions cover individual stages: preparation, SQL exploration, Microsoft semantic-model source, or tenant administration. A real opportunity remains for a coherent, local-first VS Code project that joins ingestion, transformation, semantic modeling, report authoring, interactive dashboards, persistence, tests, and Copilot assistance without depending on a Power BI tenant.
