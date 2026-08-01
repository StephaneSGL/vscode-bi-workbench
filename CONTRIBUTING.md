# Contributing

## Development setup

Use Node.js 22 or newer and Visual Studio Code 1.125 or newer.

```powershell
npm ci
npm run validate
npm run test:extension
```

Keep changes modular across `src/core`, `src/shared`, `src/ui`, `src/webview`, and `src/copilot`. Add a regression test for behavior changes. Never commit imported datasets, `.bi-workbench`, credentials, tokens, private customer metadata, or generated VSIX files.

## Pull requests

1. Explain the user-visible behavior and its security/privacy impact.
2. List the exact validation commands and results.
3. Update `README.md`, `docs/UI_SPEC.md`, and `docs/ROADMAP.md` when support status changes.
4. Preserve the distinction between available, partial, and planned behavior.
5. Do not introduce Power BI proprietary code/assets, undocumented PBIX parsing, or unsupported compatibility claims.

## Architecture rules

- The webview has no filesystem, database, or credential access.
- Parse and validate every webview mutation in the extension host.
- Keep user SQL bounded and read-only; use controlled templates and transactions for internal writes.
- Keep raw data out of logs and out of model context by default.
- Store future connector credentials with VS Code SecretStorage, never in `project.bi.json`.

## Issues and security

Use GitHub issues for non-sensitive defects and feature proposals. Follow `SECURITY.md` for vulnerabilities; do not disclose an unpatched security issue in a public issue.
