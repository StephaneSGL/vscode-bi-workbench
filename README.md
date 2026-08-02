<p align="center">
  <img src="media/bi-workbench-logo.png" alt="BI Workbench logo" width="136">
</p>

<h1 align="center">BI Workbench</h1>

<p align="center">
  <strong>Local-first business intelligence inside Visual Studio Code.</strong><br>
  Import data, transform it with DuckDB, model relationships, build interactive reports<br>
  and collaborate with GitHub Copilot in one version-controlled workspace.
</p>

<p align="center">
  <a href="https://github.com/StephaneSGL/vscode-bi-workbench/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/StephaneSGL/vscode-bi-workbench/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI status"></a>
  <img src="https://img.shields.io/badge/version-0.2.0-5B7CFA?style=flat-square" alt="Version 0.2.0">
  <img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.125.0-007ACC?style=flat-square" alt="VS Code 1.125.0 or newer">
  <img src="https://img.shields.io/badge/platform-Windows%20x64-38B2AC?style=flat-square" alt="Windows x64">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0F172A?style=flat-square" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#install-the-vsix">Install</a> &middot;
  <a href="#first-complete-workflow">First workflow</a> &middot;
  <a href="#github-copilot-integration">Copilot</a> &middot;
  <a href="#build-and-test-from-source">Build and test</a> &middot;
  <a href="docs/UI_SPEC.md">Interface inventory</a> &middot;
  <a href="docs/RESEARCH.md">Research</a>
</p>

---

BI Workbench turns a folder into a reviewable analytics project. The data engine runs locally, report metadata stays in JSON, and the extension does not require Python, Jupyter, a database server, an API key or a Power BI tenant.

| Analyze locally | Build real reports | Work with Copilot |
| --- | --- | --- |
| Import files and databases into embedded DuckDB. Run bounded read-only SQL and repeatable transformations. | Define semantic metadata, relationships and SQL measures. Create interactive dashboards with filters and cross-filtering. | Ask `@bi` for analysis, SQL and report configuration. Every data-sharing or project-writing tool remains policy- and confirmation-gated. |

> [!IMPORTANT]
> BI Workbench is an independent open-source project. It is not affiliated with Microsoft and is not Power BI. It does not read PBIX files, implement DAX or Power Query M, or copy Microsoft code, assets, proprietary formats or product behavior.

## What works today

Version `0.2.0` is a genuinely usable Windows x64 release, not a full Power BI replacement. The source is designed for desktop VS Code, but the packaged native DuckDB runtime is validated on Windows x64 only.

| Area | Available in v0.2.0 | Honest boundary |
| --- | --- | --- |
| Projects | Create, open, schema-validate, atomically save, recent projects, automatic v1-to-v2 migration with a sibling backup | No collaborative server or merge UI |
| Imports | CSV/TSV, JSON/JSONL/NDJSON, Parquet, every non-empty XLSX worksheet, all DuckDB and SQLite user tables, including empty SQLite tables | SQLite is copied read-only and limited to 512 MiB; no PostgreSQL/MySQL/ODBC |
| Data | Schema browser, bounded preview, row counts and null/distinct/min/max/average profiles | No direct cell editing or paginated virtual grid |
| Query | Bounded read-only DuckDB `SELECT`/`WITH`, cancel action, timeout, saved queries and CSV/JSON export | No write SQL, history timeline or SQL language server |
| Transform | Select, rename, cast, filter, fill null, deduplicate, sort, replace, date-part extraction and group/aggregate; transactional derived tables | No join, pivot/unpivot, fuzzy matching or arbitrary scripts |
| Model | Editable table/column labels, descriptions, visibility, semantic types and formats; validated editable relationships; reusable editable SQL measures | Measures are DuckDB SQL, not DAX; a visual's measure must belong to its source table |
| Reports | Editable reports/pages; table, KPI, bar, horizontal bar, line, area, pie, donut, scatter and slicer visuals | No maps, custom visuals, freeform pixel canvas or undo stack |
| Visual configuration | Edit, duplicate, delete, move, drag reorder, 12-column width, height, series, sorting, colors, legend, labels, smooth lines, number/currency/percent formats and descriptions | Layout is a deterministic grid; width/height are configured fields rather than mouse-resize handles |
| Interaction | Page filters, chart/slicer cross-filters and active chips; multi-hop propagation across unambiguous active relationships with direction checks | Ambiguous equal-length paths are rejected; no many-table measure expression planner |
| Export | Formula-safe CSV, JSON, per-visual CSV and standalone static HTML report page | No PDF/PNG or live hosted dashboard |
| Copilot | `@bi` participant; schema and bounded-query tools; confirmation-gated report creation and validated visual application | Requires a model exposed by VS Code; no bundled subscription, key or autonomous background writes |

The complete interface inventory is in [`docs/UI_SPEC.md`](docs/UI_SPEC.md). The competitive and legal analysis is in [`docs/RESEARCH.md`](docs/RESEARCH.md).

## Requirements

- Visual Studio Code `1.125.0` or newer.
- Windows x64 for the prebuilt `0.2.0` VSIX.
- A trusted workspace. The extension reads local files and executes analytical SQL, so it is intentionally disabled in untrusted workspaces.
- GitHub Copilot Chat, or another language-model provider exposed through the VS Code Language Model API, only for optional AI features.

BI Workbench does not require Python, Jupyter, a database server, an API key or a Power BI tenant.

## Install the VSIX

Download or build `vscode-bi-workbench-0.2.0.vsix`, then run:

```powershell
code --install-extension .\vscode-bi-workbench-0.2.0.vsix --force
```

Reload VS Code. Run `BI Workbench: Open BI Workbench` from the Command Palette or press `Ctrl+Alt+B`.

To remove it:

```powershell
code --uninstall-extension stephanesgl.vscode-bi-workbench
```

The public source repository is [`StephaneSGL/vscode-bi-workbench`](https://github.com/StephaneSGL/vscode-bi-workbench). Marketplace and Open VSX publication are not claimed.

## First complete workflow

1. Run `BI Workbench: Create BI Project` and choose a parent directory.
2. Open **Import** and select CSV, TSV, JSON, JSONL, NDJSON, XLSX, Parquet, DuckDB, SQLite or mixed local files. Source files are read or copied; they are never modified.
3. Inspect a table on **Data** and run **Profile columns**.
4. Use **Query** for bounded read-only DuckDB SQL, for example:

   ```sql
   SELECT region, SUM(revenue) AS revenue
   FROM sales
   GROUP BY region
   ORDER BY revenue DESC;
   ```

5. Use **Transform** to create a derived table. A failed transformation rolls back and preserves the previous valid table.
6. In **Model**, configure table and column presentation, then create active relationships. In **Measures**, add or edit a validated SQL aggregate such as `SUM("revenue")`.
7. In **Reports**, rename the report/page and add a chart, KPI, table or slicer. Reopen any visual with the edit button to configure series, order, size, colors, labels, formats and interactions.
8. Add page filters or click a chart/slicer category. Related-table visuals are recomputed when an active, direction-compatible relationship path exists.
9. Export query data, one visual's data, or the current report page as standalone HTML.

Project layout:

```text
my-bi-project/
├─ project.bi.json
└─ .bi-workbench/
   └─ data.duckdb
```

`project.bi.json` is reviewable and suitable for source control when it contains no sensitive business metadata. `.bi-workbench/` contains imported data and is ignored by the supplied `.gitignore`. Opening a schema-v1 project creates a timestamped sibling `*.v1.backup-*.json` before writing schema v2.

## GitHub Copilot integration

Open VS Code Chat and use:

```text
@bi /sql calculate revenue by region
@bi /analyze identify the important aggregate trends
@bi /report create a management report, then add its visuals
@bi /visual configure monthly revenue by region as a multi-series chart
```

Four language-model tools are registered:

- `#biProjectSchema` returns project tables, columns, relationships, measures, reports, pages and visual IDs without raw rows.
- `#biQuery` runs one bounded read-only query after privacy checks and user confirmation. It is disabled in the default schema-only mode.
- `#biCreateReport` creates a report and its first page only after explicit confirmation, then returns their stable IDs.
- `#biConfigureVisual` creates or updates a visual only after explicit confirmation. The extension parses the complete visual schema and executes its real bounded DuckDB query before committing the change.

The `@bi` participant can call those tools in a bounded tool loop and reports exact tool results back to the selected model. It is instructed not to claim a project change unless an application tool actually returned success.

`biWorkbench.copilotDataSharing` defaults to `schema`. Choosing `aggregates` or `samples` deliberately broadens what an invoked AI workflow may send to the selected model provider. Group keys and order-statistic aggregates can reveal individual values; sample mode can disclose raw rows.

## Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `biWorkbench.previewRowLimit` | `500` | Maximum table-preview rows |
| `biWorkbench.queryRowLimit` | `5000` | Maximum ad-hoc rows returned to the UI |
| `biWorkbench.autoSave` | `true` | Save metadata after validated changes |
| `biWorkbench.copilotDataSharing` | `schema` | Schema, aggregates or bounded samples for invoked AI features |
| `biWorkbench.maxCopilotSampleRows` | `20` | Raw-row ceiling in sample mode |

The **Settings** page also stores a project report theme: name, primary color, dashboard background and chart palette.

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

`npm run validate` performs type checking, linting, all Vitest suites and a production build. `npm run test:extension` launches a clean VS Code Extension Host and verifies activation, commands, package declarations and the four registered language-model tools. `npm run package` reruns validation, regenerates third-party license text and writes the VSIX under `artifacts/`.

For interactive development, open the repository in VS Code and press `F5`, or run `npm run build:watch` before launching **Run BI Workbench Extension**.

## Known limits and next work

- No PBIX reader/writer, DAX, Power Query M, Power BI tenant or Microsoft proprietary-format compatibility.
- No PostgreSQL, MySQL, ODBC or cloud warehouse connector yet.
- No join/pivot/unpivot transformation designer, cross-table measure planner, map, freeform pixel layout, undo/redo, PDF/PNG export or hosted collaboration.
- SQLite uses bundled `sql.js` for a portable read-only copy and therefore refuses files above 512 MiB. Large sources should be converted to Parquet or DuckDB first.
- The packaged native extension has been validated on Windows x64; other platforms require their own build, package and Extension Host evidence.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) and [`docs/COMPLETION_AUDIT.md`](docs/COMPLETION_AUDIT.md) for the exact status of future work.

## Architecture, security and evidence

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): runtime boundaries, project schema, data engine, relationship filters and Copilot tool loop.
- [`SECURITY.md`](SECURITY.md): local data handling, SQL restrictions, SQLite boundary, Copilot privacy and Workspace Trust.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): runtime dependency notices.
- [`TEST_REPORT.md`](TEST_REPORT.md): reproducible validation evidence for the release.

The extension collects no telemetry. Data remains inside the selected project unless the user explicitly exports it or invokes a configured model feature.

## License

BI Workbench source is available under the [MIT License](LICENSE). Apache ECharts is Apache-2.0. DuckDB, `sql.js`, `read-excel-file` and Zod are permissively licensed; exact versions and upstream notices are recorded in the generated third-party license files.
