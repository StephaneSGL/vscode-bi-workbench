# BI Workbench for Visual Studio Code

BI Workbench is an independent, local-first Business Intelligence extension for Visual Studio Code. It combines file ingestion, DuckDB SQL, deterministic transformations, a small semantic model, interactive report pages, and GitHub Copilot assistance in one versioned project.

This project is not affiliated with Microsoft and is not Power BI. It does not read PBIX files, implement DAX or Power Query M, or copy Power BI code, assets, or proprietary behavior.

## Release status

Version `0.1.0` is a usable Windows x64 foundation, not a full Power BI replacement. The source is designed to build on other desktop platforms, but the published v0.1.0 VSIX contains the native DuckDB binding installed and validated on Windows x64.

| Area | Available in v0.1.0 | Boundary |
| --- | --- | --- |
| Projects | Create, open, schema-validate, atomically save, recent projects | First schema version; no migration from older released formats |
| Imports | CSV/TSV, JSON/JSONL/NDJSON, Parquet, every non-empty XLSX worksheet, all DuckDB base tables | `.db` means DuckDB in v0.1; no SQLite/PostgreSQL/MySQL/ODBC |
| Data | Schema browser, bounded preview, row counts, null/distinct/min/max/average profiles | No direct grid editing or pagination |
| Query | One bounded read-only DuckDB `SELECT`/`WITH` query, 30-second timeout, saved queries, CSV/JSON export | No write SQL, query history, or explicit Cancel button |
| Transform | Select, rename, cast, filter, fill null, deduplicate, sort; transactional derived tables | No join, group, pivot/unpivot, or visual diff |
| Model | Tables, typed columns, validated relationship metadata, reusable validated SQL aggregate measures | Measures are SQL, not DAX; report filtering does not propagate across relationships yet |
| Reports | Reports/pages, table, KPI, bar, horizontal bar, line, area, pie, donut, scatter, clickable slicer | Deterministic responsive grid; no drag/resize or maps |
| Interaction | Page filters, active chips, chart clicks, slicer clicks, same-table recomputation | Cross-table propagation is planned |
| Export | Formula-safe CSV, JSON, standalone static HTML report page | No PDF/PNG in v0.1 |
| Copilot | `@bi` participant and schema/read-only query tools using VS Code's model APIs | Requires a model available in VS Code; generated output is a proposal, never an automatic write |

The complete UI inventory is in [`docs/UI_SPEC.md`](docs/UI_SPEC.md). Research and comparisons are in [`docs/RESEARCH.md`](docs/RESEARCH.md).

## Requirements

- Visual Studio Code `1.125.0` or newer.
- Windows x64 for the prebuilt v0.1.0 VSIX.
- A trusted workspace: the extension reads local files and runs analytical SQL, so it is intentionally disabled in untrusted workspaces.
- GitHub Copilot Chat, or another language-model provider exposed by VS Code, only for the optional AI features.

BI Workbench itself does not require Python, Jupyter, a database server, an API key, or a Power BI tenant.

## Install the VSIX

Download `vscode-bi-workbench-0.1.0.vsix` from the GitHub release, then run:

```powershell
code --install-extension .\vscode-bi-workbench-0.1.0.vsix --force
```

Reload VS Code. Open the Command Palette and run `BI Workbench: Open BI Workbench`, or press `Ctrl+Alt+B`.

To remove it:

```powershell
code --uninstall-extension stephanesgl.vscode-bi-workbench
```

The extension has not been published to the Visual Studio Marketplace or Open VSX in v0.1.0.

## First complete workflow

1. Run `BI Workbench: Create BI Project` and choose a parent directory.
2. Open the **Import** page and choose one or more supported files.
3. Inspect the imported table on **Data** and run **Profile columns**.
4. Use **Query** for a bounded read-only DuckDB query, for example:

   ```sql
   SELECT region, SUM(revenue) AS revenue
   FROM sales
   GROUP BY region
   ORDER BY revenue DESC;
   ```

5. Use **Transform** to build a derived table without modifying the imported source file.
6. Define relationship metadata in **Model** and a SQL aggregate such as `SUM("revenue")` in **Measures**.
7. On **Reports**, add a chart or slicer. Add page filters or click a chart category/slicer value to recompute visuals on the same table.
8. Export the current page to a dependency-free HTML snapshot.

Project layout:

```text
my-bi-project/
├─ project.bi.json
└─ .bi-workbench/
   └─ data.duckdb
```

Commit `project.bi.json` when appropriate. Do not commit `.bi-workbench/` unless you have deliberately reviewed and authorized publication of its data.

## GitHub Copilot integration

Open VS Code Chat and use one of:

```text
@bi /sql calculate revenue by region
@bi /analyze identify the most important aggregate trends
@bi /report propose a two-page management report
@bi /visual choose a visual for monthly revenue and explain the fields
```

Two tools are also exposed to VS Code Chat:

- `#biProjectSchema` returns tables, columns, relationships, measures, and reports without raw rows.
- `#biQuery` runs one bounded read-only query after the applicable confirmation and privacy checks.

`biWorkbench.copilotDataSharing` defaults to `schema`. Selecting `aggregates` or `samples` deliberately broadens what an invoked AI feature may send to the model provider. Sample mode is inappropriate for confidential data unless the user is authorized to disclose it.

## Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `biWorkbench.previewRowLimit` | `500` | Maximum preview rows |
| `biWorkbench.queryRowLimit` | `5000` | Maximum ad-hoc query rows returned to the UI |
| `biWorkbench.autoSave` | `true` | Save metadata after validated changes |
| `biWorkbench.copilotDataSharing` | `schema` | Schema, aggregates, or bounded samples for invoked AI features |
| `biWorkbench.maxCopilotSampleRows` | `20` | Raw-row ceiling in sample mode |

## Build and test from source

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:ui
npm run validate
npm run test:extension
npm run package
```

`npm run validate` performs type checking, linting, all Vitest suites, and a production build. `npm run test:extension` launches a clean VS Code Extension Host and verifies activation plus command registration. `npm run package` writes the VSIX under `artifacts/`.

For interactive development, open this folder in VS Code and press `F5`, or run `npm run build:watch` before launching the **Run BI Workbench Extension** configuration.

## Architecture and security

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): extension-host/webview boundaries, storage, query flow, and resource profile.
- [`SECURITY.md`](SECURITY.md): data handling, SQL restrictions, Copilot privacy, Workspace Trust, and vulnerability reporting.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): runtime licenses.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): completed v0.1 scope and explicitly planned work.
- [`TEST_REPORT.md`](TEST_REPORT.md): reproducible validation evidence for the release.

The extension does not collect telemetry. Imported data stays in the selected project unless the user explicitly invokes a configured model feature or exports a file.

## License

BI Workbench source code is available under the [MIT License](LICENSE). Apache ECharts is Apache-2.0; DuckDB, `read-excel-file`, and Zod are MIT-licensed. See the third-party notices for exact versions and upstream projects.
