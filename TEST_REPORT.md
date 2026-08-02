# BI Workbench 0.2.0 validation report

Validation date: 2026-08-02
Environment: Windows x64, Node.js 24.14.0, npm 11.9.0, Visual Studio Code 1.130.0

This report separates core behavior tests, real-browser webview QA, clean Extension Host verification, VSIX inspection and installation. It does not treat one layer as proof of another.

## Test inventory

| Layer | Coverage |
| --- | --- |
| Unit | SQL safety/compilation, schema-v2 migration/defaults, runtime message parsing and CSV/JSON/HTML export |
| Integration | Persistent DuckDB; generated local-format imports; SQLite source preservation; project migration/persistence; transformations; measures; visual validation; same/related-table filters; multi-hop direction/ambiguity behavior |
| UI DOM | Empty/project/report rendering, slicers, complete existing-visual form submission and semantic table-presentation submission |
| Browser interaction | Built production webview in headed Chromium: multiseries charts, KPI/table formats, existing-visual edit, temporary slicer filter, visual ordering, responsive layout and console audit |
| Extension Host | Discovery, activation, commands, four language-model tool registrations, package metadata, Workspace Trust and actual BI Workbench webview-tab creation |
| Package/install | VSIX construction and archive audit, forced local installation, installed identity, packaged DuckDB binding load and packaged SQLite WASM execution |

## Final local results

| Check | Command / method | Result |
| --- | --- | --- |
| Type, lint, all automated suites and production bundles | `npm run validate` | Pass repeatedly. Final run: 12 test files and 41 tests, then both production bundles. |
| Unit suite | `npm run test:unit` | Pass: 5 files, 26/26 tests. |
| Integration suite | `npm run test:integration` | Pass: 5 files, 10/10 tests. Generated temporary CSV, JSONL, Parquet, XLSX, DuckDB and SQLite inputs were used. |
| SQLite preservation | Integration SHA/byte comparison before and after import | Pass. Populated and empty tables copied; source bytes unchanged. |
| Relationship filters | Real temporary DuckDB report queries | Pass for same-table, single-hop, multi-hop and direction; ambiguous equal-length paths are rejected. |
| UI DOM suite | `npm run test:ui` | Pass: 2 files, 5/5 tests. |
| Browser interaction | Playwright CLI against the built webview in headed Chromium | Pass. Existing multi-series visual edited (width, color, labels), slicer created a temporary filter chip, visual moved, and responsive render inspected at approximately 988x485 and 900x700. Final console: 0 errors, 0 warnings. |
| VS Code Extension Host | `npm run test:extension` with VS Code 1.130.0 | Pass after production build. The extension activated, declared commands/tools were registered, and `biWorkbench.open` produced a `BI Workbench` webview tab. Host exit code 0. |
| Package | `npm run package` | Pass. 36 VSIX files, 14,532,719 bytes (13.86 MiB). Package reran all 41 tests and production builds. |
| Package SHA-256 | `Get-FileHash -Algorithm SHA256` | `D6C512D8BF8C9EBC306186C907CA056EF4226C9B8A875E0590FA3661E946FA01` |
| Package contents | ZIP entry audit | Pass. Project schema, four required `sql.js` files including WASM, Windows x64 DuckDB DLL, notices and 46,583-byte collected license file are present; tests and source maps are absent. |
| Installation | `code --install-extension artifacts\vscode-bi-workbench-0.2.0.vsix --force` | Pass. VS Code reported successful installation. |
| Installed identity | `code --list-extensions --show-versions` | `stephanesgl.vscode-bi-workbench@0.2.0` present. |
| Installed runtimes | Direct loads from the installed extension directory | Pass. Packaged DuckDB v1.5.5 executed `SELECT 42 AS answer`; packaged `sql.js` executed `SELECT 42` and returned 42. |
| Dependency audits | `npm audit --omit=dev --json` and `npm audit --json` | Pass: 0 known vulnerabilities; 5 production and 532 total dependency nodes reported. |
| Secret-pattern scan | Bounded `rg` scan excluding dependencies/generated artifacts | Pass: 0 token, private-key, password-assignment or API-key-assignment matches. |

The packaged SQLite footprint was reduced from 28 package files to the four required runtime/license/manifest files. The final installed reader was retested after that reduction.

## Copilot verification boundary

The clean Extension Host proves that the four tools are accepted by VS Code and registered at runtime. The project-manager path used by report/visual application has integration coverage, and the visual path executes a real query before commit. A direct tool call outside Chat cannot be manufactured correctly because `vscode.lm.invokeTool` requires a Chat-issued `toolInvocationToken`; the clean host has no user model entitlement or live Chat turn. Therefore this report does not claim an end-to-end provider inference session. The API registration, confirmation definitions, bounded participant loop and underlying mutations are tested at their available boundaries.

## Public CI evidence

The public draft [PR #1](https://github.com/StephaneSGL/vscode-bi-workbench/pull/1) ran the Windows `windows-validation` job successfully on product/CI-fix commit `2794198b6b4ada119311860aff9f8404e42a4a55`. [GitHub Actions run 30726121100](https://github.com/StephaneSGL/vscode-bi-workbench/actions/runs/30726121100) completed in 2m11s and passed `npm ci`, `npm run validate`, `npm run test:extension`, `npm run package` and `actions/upload-artifact`. The uploaded artifact is named `vscode-bi-workbench-windows-x64`.

The first PR run had already passed the product tests and package construction but failed because the upload step still named the v0.1 VSIX. Commit `2794198` changed only that path to the v0.2 file; the next complete run passed. This report does not hide the failed release-infrastructure attempt or misclassify it as a product-test failure.

## Non-product warnings observed

- The clean host prints a warning from VS Code's built-in Mermaid extension about a private API proposal. It does not identify BI Workbench and the host exits with code 0.
- `code --install-extension` prints Node `DEP0169` from the VS Code CLI's use of `url.parse()`. Installation and installed identity checks pass.
- VSCE reports the 35.02 MiB uncompressed `duckdb.dll` as large. It is the required native analytical engine; the compressed VSIX is 13.86 MiB.

## Defects found and corrected during v0.2 stabilization

- ECharts 6 warned about the legacy `grid.containLabel` option and disposed instances during resize callbacks. The renderer now uses `outerBounds` settings and disconnects observers before disposal; final console audit is clean.
- Narrow KPI cards lost their titles/actions and large values overflowed. Container-responsive action layout and KPI typography now pass 900-pixel viewport review.
- The first VSIX included unused `sql.js` debug, ASM and worker builds. `.vscodeignore` now packages only the selected WASM runtime and its required metadata/license.
- Extension-tab assertion ran before VS Code exposed the new tab. The test now waits one bounded UI tick and then verifies the real `BI Workbench` tab.
- SQLite import staging originally registered its temporary JSONL file too late to clean it after a target transaction failure. Cleanup registration now happens immediately and an integration regression test forces that failure path.
- Copilot schema context originally exposed saved-query SQL and report-filter values even though neither was needed for structural assistance. Schema tools now return query names and filter metadata only; unit coverage verifies that stored SQL and filter secrets are absent.
- Read-only SQL blocked the primary file-reader names but not every scanner/network alias or quoted function spelling. The guard now rejects external readers, scanners, attachments, network/secret/engine-metadata functions and quoted function calls; aggregate sharing has a conservative direct-SELECT grammar with bypass regression cases.
- Timeout handling originally released the serialized connection queue as soon as the timer won a promise race. It now interrupts and awaits native query settlement before reuse; an integration test forces a one-millisecond timeout and immediately proves connection recovery.

No passing test is presented as proof of Marketplace publication, Power BI compatibility, a Power BI tenant connection, a live model-provider subscription or cross-platform native-package compatibility.
