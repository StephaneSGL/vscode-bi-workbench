# BI Workbench 0.3.0 validation report

Validation date: 2026-08-02
Environment: Windows x64, Node.js 24.14.0, npm 11.9.0, Visual Studio Code 1.130.0, Power BI Desktop 2.156.951.0

This report keeps automated schemas, browser rendering, VS Code activation, installed runtimes and Power BI Desktop interoperability as separate evidence layers. Passing one layer is not presented as proof of every other layer.

## Test inventory

| Layer | Coverage |
| --- | --- |
| Unit | SQL safety/compilation, schema migration/defaults, project messages/exports, Copilot privacy/tool schemas and Power BI name/type/DAX adapters |
| Integration | Persistent DuckDB, generated file/database imports, SQLite preservation, project persistence, transformations, measures, relationship filters and complete Power BI project generation |
| UI DOM | Empty/project/report rendering, slicers, semantic forms, existing-visual submission, authoring shell/inspector panes and legacy-theme fallback |
| Browser visual QA | Built production webview in headed Chromium at 1440×900 in VS Code-style dark and light themes |
| Extension Host | Discovery, activation, commands, package metadata, five language-model tools and real BI Workbench webview-tab creation |
| Power BI Desktop | Exact final PBIP fixture open, relationship update and local CSV refresh in Desktop 2.156.951.0 |
| Package/install | VSIX construction, archive audit, forced local installation, installed identity, native DuckDB binding and SQLite WASM queries |

## Final local results

| Check | Command / method | Result |
| --- | --- | --- |
| Complete validation | `npm run validate` | Pass repeatedly, including both final package runs: typecheck, ESLint, 14 files/47 tests and production bundles. |
| Unit suite | `npm run test:unit` | Pass: 6 files, 30/30 tests. |
| Integration suite | `npm run test:integration` | Pass: 6 files, 11/11 tests. |
| UI DOM suite | `npm run test:ui` | Pass: 2 files, 6/6 tests. |
| Power BI integration validator | Synthetic two-table model, relationship, measure and all ten visual types through `@microsoft/powerbi-report-authoring-cli` | Pass: zero PBIR catalog/schema errors. TMDL comments, many-to-one endpoint normalization, `FitToWidth`, full CSV rows, no-overwrite and 240-character path rejection are asserted. |
| Power BI Desktop final smoke | Generated `Retail-Analytics.pbip`, opened through the Windows file association, then invoked both visible `Actualiser maintenant` actions through UI Automation | Pass on Desktop 2.156.951.0. The relationship notice cleared, the incomplete-data notice cleared, no error dialog/name was detected and the card exposed `CarteTotal revenue, 65,00`. |
| Production webview visual QA | Playwright CLI, Chromium, 1440×900, production JS/CSS | Pass in dark and light themes. Ribbon, work-area rail, report/page tabs, canvas and Filters/Visualizations/Data inspector render correctly; console 0 errors/0 warnings, body width 1440/1440 and KPI scroll/client width 258/258. |
| VS Code Extension Host | `npm run test:extension` with VS Code 1.130.0 | Pass, exit code 0. BI Workbench activated, opened its webview tab, declared commands/views and registered five language-model tools. |
| Package | `npm run package` | Pass. Final archive: 36 files, 14,685,136 bytes. Packaging reran all 47 tests and production builds. |
| Package SHA-256 | `Get-FileHash` plus generated `artifacts/SHA256SUMS.txt` | `46D4D206CFD956128ED16B2AF3A0FC948B2D5C2514AE46FC9179BF3822A13874`; the generated checksum line matches. |
| Package contents | ZIP entry audit | Pass. Manifest, production bundles, project schema, logo, notices, one Windows x64 DuckDB DLL and one SQLite WASM are present. Missing required: 0; forbidden source/test/docs/maps/declarations/env files: 0. |
| Installation | `code --install-extension .\artifacts\vscode-bi-workbench-0.3.0.vsix --force` | Pass; VS Code reported successful installation. |
| Installed identity | `code --list-extensions --show-versions` | `stephanesgl.vscode-bi-workbench@0.3.0` present. |
| Installed DuckDB runtime | Direct query through the packaged low-level binding | Pass: library `v1.5.5`, one row, column `answer` for `SELECT 42 AS answer`. |
| Installed SQLite runtime | Direct query through packaged `sql-wasm.js`/`sql-wasm.wasm` | Pass: `SELECT 42 AS answer` returned 42. |
| Dependency audits | `npm audit --omit=dev --json` and `npm audit --json` | Pass: 0 known vulnerabilities, including 0 high/critical; metadata reports 5 production, 524 development and 107 optional dependency nodes (536 total). |
| License collection | `scripts/collectLicenses.mjs` during packaging | Pass: deterministic 46,583-byte license collection plus notices. The MIT Microsoft PBIR validator remains development-only and is absent from the VSIX. |
| Secret-pattern scan | Bounded `rg` scan excluding dependencies, builds, artifacts and QA output | Pass: 0 matching files. |

## Copilot verification boundary

Five tools are declared and registered: schema, bounded query, confirmed report creation, confirmed visual configuration and confirmed Power BI export. Unit/integration tests cover their schemas, privacy boundaries and underlying real mutations/export service. The Power BI tool cannot receive a model-supplied path and its result omits the selected absolute path.

A synthetic direct end-to-end provider inference is not claimed. `vscode.lm.invokeTool` requires a Chat-issued invocation token and an eligible user-owned model session. The extension bundles no Copilot subscription, API key or hidden provider.

## Power BI verification boundary

The final exporter was not validated only as JSON. Its exact final fixture opened and refreshed in the installed Power BI Desktop version stated above. This proves the documented v0.3 subset used by that fixture: generated PBIP/PBIR/TMDL, two tables, complete CSV partitions, one relationship, one conservative DAX measure and ten supported visuals.

It does not prove direct PBIX generation, PBIP-to-PBIX Save As, tenant publishing, credentials, custom visuals, unsupported filters/styles, every Desktop version or future Microsoft schema compatibility. Those remain explicit limits.

## Public CI evidence

The public draft [PR #1](https://github.com/StephaneSGL/vscode-bi-workbench/pull/1) contains the v0.3 work on branch `agent/configurable-bi-v0.2`. Product commit `7cf065e` passed public [GitHub Actions run 30740825458](https://github.com/StephaneSGL/vscode-bi-workbench/actions/runs/30740825458) in 2m28s. The Windows job passed `npm ci`, `npm run validate`, `npm run test:extension`, `npm run package` and `actions/upload-artifact`; the uploaded artifact is named `vscode-bi-workbench-windows-x64`.

## Non-product warnings observed

- The clean Extension Host printed a mutex warning plus logging/proposed-API warnings from VS Code built-ins and locally discovered Copilot plugins. BI Workbench tests completed and the host exited 0.
- `code --install-extension` printed Node `DEP0169` from the VS Code CLI's own `url.parse()` use. Installation and installed identity both passed.
- VSCE reports the required 35.02 MiB native DuckDB DLL as large; the compressed final VSIX is about 14 MiB.

## Defects found and corrected during v0.3 stabilization

- Desktop initially rejected a generated visual whose Windows path reached 262 characters. Model/report/table artifacts now use short deterministic names and the exporter checks a conservative 240-character budget before staging.
- Desktop rejected TMDL `description:` properties. Descriptions now use documented `///` comments.
- Desktop rejected the original relationship endpoint convention. Endpoints/cardinalities now follow many-to-one TMDL rules; one-to-one filtering is normalized with a warning.
- Multi-visual pages were too small with `FitToPage`; final PBIR uses `FitToWidth`.
- A legacy visual state without a theme could stop report rendering. The webview/chart adapters now use the default theme during migration and have a regression test.
- Narrow KPI values clipped and the inspector exposed an unnecessary horizontal scrollbar. Responsive KPI sizing, hover/focus visual commands and horizontal containment were visually rechecked in both themes.
- Temporary Playwright helpers were initially included in ESLint discovery. Generated `output/**` is now excluded while tracked source remains fully linted.
- Two runtime dependency declaration files were included in the first candidate archive. `**/*.d.ts` is now excluded; the final audit contains 36 entries and no source declarations.

No passing result is presented as evidence of Marketplace/Open VSX publication, PR merge, a live Power BI tenant, a successful PBIX Save As, or cross-platform native-package compatibility.
