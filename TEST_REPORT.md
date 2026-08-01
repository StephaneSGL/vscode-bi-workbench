# BI Workbench 0.1.0 validation report

Validation date: 2026-08-01
Environment: Windows x64, Node.js 24.14.0, npm 11.9.0, Visual Studio Code 1.130.0

This report is finalized from command output immediately before the v0.1.0 commit and public release. It distinguishes automated behavior tests, visual/browser QA, Extension Host activation, and package installation.

## Test inventory

| Layer | Coverage |
| --- | --- |
| Unit | SQL safety and compilation, project schema, runtime message parsing, CSV/JSON/HTML export |
| Integration | Persistent DuckDB engine; CSV/JSON/JSONL/Parquet/XLSX/DuckDB imports; project create/save/open; transforms; measures; reports; filters; exports |
| UI DOM | Empty/project/report rendering, visual controls, clickable slicer values |
| Browser interaction | Real Chromium render, filter form interaction, emitted host message, console errors, visual inspection |
| Extension Host | Extension discovery, activation, command registration, package metadata, Workspace Trust declaration |
| Package/install | VSIX construction, content inspection, `code --install-extension`, installed-extension listing |

## Final results

| Check | Command / method | Result |
| --- | --- | --- |
| Clean dependency install | `npm ci` | Pass from `package-lock.json`; 465 packages installed, 466 audited, 0 vulnerabilities. |
| Type + lint + automated suites + production build | `npm run validate` | Pass. 8 test files and 25 tests: 17 unit, 5 integration, 3 UI DOM. The full validation pipeline completed successfully six times during stabilization, including once immediately after the clean install. |
| Unit suite | `npm run test:unit` | Pass, 17/17. |
| Integration suite | `npm run test:integration` | Pass, 5/5. Real temporary DuckDB databases and generated CSV, JSONL, Parquet, XLSX, and DuckDB inputs were used. |
| UI DOM suite | `npm run test:ui` | Pass, 3/3. |
| Browser interaction | Playwright CLI against the built webview in Chromium | Pass. Report page rendered at 1440x1000; entering `North` and clicking **Apply** emitted the expected `upsertFilter` request. Browser console: 0 errors and 0 warnings. Visual inspection found no clipping or overlap in the tested viewport. |
| VS Code Extension Host | `npm run test:extension` with VS Code 1.130.0 | Pass twice. Extension discovered and activated; commands and package/Workspace Trust declarations verified; host exit code 0. |
| Package | `npm run package` | Pass. Official clean-checkout CI artifact: 32 VSIX files, 14,169,598 bytes (13.51 MiB). |
| Package integrity | `Get-FileHash -Algorithm SHA256` | `2BABB6802B8C18EE5097FD1949D288077287044EA1ECD64ECA04FD0E5A8C6FD9` |
| Package contents | archive listing and installed-folder checks | Pass. Extension/webview bundles, project schema, Windows x64 DuckDB DLL, notices, and 44,215-byte collected third-party license file present. |
| Installation | `code --install-extension artifacts\vscode-bi-workbench-0.1.0.vsix --force` | Pass. VS Code reported successful installation. |
| Installed identity | `code --list-extensions --show-versions` | `stephanesgl.vscode-bi-workbench@0.1.0` present. |
| Installed native dependency | direct load of packaged `@duckdb/node-bindings` | Pass. |
| Dependency audit | `npm audit --omit=dev --json` and `npm audit --json` | 0 known vulnerabilities in production and complete dependency audits; 529 dependency nodes reported by npm. |
| Secret-pattern scan | bounded `rg` scan excluding dependencies/generated artifacts | No token, private-key, password-assignment, or API-key-assignment pattern found. |

The final `npm run package` reran type checking, lint, all 25 automated tests, and both production bundles before writing the VSIX.

## Public CI evidence

The initial public Windows validation run completed successfully in 2 minutes 14 seconds: `npm ci`, `npm run validate`, `npm run test:extension`, `npm run package`, and artifact upload all passed. Run: https://github.com/StephaneSGL/vscode-bi-workbench/actions/runs/30721973755

That run annotated the then-used GitHub Actions v4 JavaScript runtime as Node 20-deprecated. The workflow now uses the official v7 releases for checkout, Node setup, and artifact upload. The updated workflow passed in 1 minute 47 seconds with every step green: https://github.com/StephaneSGL/vscode-bi-workbench/actions/runs/30722087226

The locally built and clean-checkout CI VSIX archives were compared file by file. All executable bundles, schema files, native binaries, manifests, and notices matched. Only newline encoding differed in README, changelog, and the generated license compilation. The clean-checkout CI artifact was selected, reinstalled successfully, and is the release artifact whose hash is recorded above.

## Non-product warnings observed

- The local Extension Host printed a warning from VS Code's built-in Mermaid/Copilot plugin environment about a private API proposal. The BI Workbench test process still exited with code 0; the warning did not reference this extension.
- `code --install-extension` printed Node's `DEP0169` warning from the VS Code CLI path. Installation completed and the installed identity was verified.
- VSCE reports that `duckdb.dll` is 35.02 MiB before ZIP compression. This is the required native analytical engine; the complete compressed VSIX is 13.51 MiB.
- `npm ci` reported deprecation notices for transitive `whatwg-encoding` and `prebuild-install`; npm's production and complete vulnerability audits both remained at zero. These dependencies should be reevaluated during routine upgrades.

The browser-interaction artifact was used for local QA and is intentionally excluded from the repository and VSIX because it contains generated harness state rather than product source.

## Earlier defects found and corrected

- XLSX integration initially exposed an incompatible behavior in `read-excel-file` 9.3.5; the runtime was pinned to the tested 8.0.3 release.
- DuckDB database import initially attempted `DETACH` while a transaction was active; the connector now serializes attach/copy/commit/detach correctly and identifies source base tables through `duckdb_tables()`.
- The first slicer renderer only displayed distinct values; it now emits real temporary cross-filter requests and has a DOM regression test.

No passing test is treated as proof of Marketplace publication, Power BI compatibility, tenant integration, or cross-platform native-package compatibility.
