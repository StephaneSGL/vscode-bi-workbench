# Security policy

## Data handling

BI Workbench is local-first. Imported data is written to `.bi-workbench/data.duckdb` inside the selected project. That directory is ignored by the supplied `.gitignore`; users must review Git status before committing any data.

The extension does not collect telemetry and does not bundle analytics, credentials, or a remote service.

## GitHub Copilot and language models

The `@bi` feature sends context only after the user invokes it. The default setting sends schema and report metadata, not raw values. Aggregate summaries or raw samples require an explicit setting. The selected VS Code language-model provider is responsible for model processing and its own terms.

Never place passwords, tokens, private keys, or confidential values in project metadata, prompts, saved queries, or screenshots.

## SQL boundary

Ad-hoc and model-tool queries are restricted to one bounded read-only query. SQL that mutates data, attaches a database, reads arbitrary files, installs/loads extensions, copies data, or invokes network/file table functions is rejected. Imports and transformations use separate controlled code paths.

## Workspace Trust

The extension is disabled in untrusted workspaces because a BI project can reference local files and execute analytical SQL.

## Reporting a vulnerability

Do not open a public issue for an undisclosed vulnerability. Use GitHub's private vulnerability reporting feature for `StephaneSGL/vscode-bi-workbench` when available. Include affected version, reproduction, impact, and suggested mitigation without real credentials or private datasets.
