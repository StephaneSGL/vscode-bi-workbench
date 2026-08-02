# Security policy

## Data handling

BI Workbench is local-first. Imported and derived data is written to `.bi-workbench/data.duckdb` inside the chosen project. The supplied `.gitignore` excludes that directory; users must still inspect Git status and project metadata before publishing a repository.

Source CSV/JSON/XLSX/Parquet/DuckDB/SQLite files are read or copied and never modified. Imports and transformations are transactional. SQLite is opened from source bytes with bundled `sql.js`, is limited to 512 MiB because that reader is memory-backed, and is copied into the project DuckDB database.

Schema-v1 metadata is backed up beside the project before v2 migration. Normal metadata writes use a temporary sibling file and atomic rename. Project JSON is not a credential store.

The extension collects no telemetry and bundles no analytics service, credentials or remote backend.

## GitHub Copilot and language models

AI context is created only after the user invokes `@bi` or a BI tool. `biWorkbench.copilotDataSharing` defaults to `schema`, which excludes raw row values, saved-query SQL text and persisted filter values; safe query names and filter structure remain available. Aggregate summaries and bounded raw samples require an explicit setting and may disclose sensitive business information to the model provider selected in VS Code.

The `aggregates` mode permits bounded grouped summaries, so group labels and order-statistic aggregates such as minima, maxima, medians or quantiles can still reveal individual values. Its query tool rejects CTEs, subqueries, joins, windows, set operations, top-level wildcards and unapproved SELECT-list functions to prevent a raw-row query from being disguised by an unrelated aggregate.

The query, create-report and configure-visual tools use VS Code confirmation messages. Write tools modify only project metadata after confirmation. Visual application also executes the real bounded visual query before commit. The extension does not store a Copilot/API token, select a hidden remote model or run background autonomous AI tasks.

Never place passwords, tokens, private keys, connection strings or confidential row values in project metadata, prompts, saved-query names, logs, screenshots or public issues.

## SQL boundary

Ad-hoc and language-model queries are restricted to one bounded read-only statement. The guard rejects mutations, multiple statements, `ATTACH`, `COPY`, `INSTALL`, `LOAD`, extension commands, arbitrary file readers and network/file table functions. Query execution is bounded, timed and interruptible.

Imports and transformations use separate controlled code paths with quoted identifiers, escaped literal paths and transactions. Measures accept a restricted aggregate-expression grammar and visuals are compiled from validated metadata rather than arbitrary generated SQL.

## Relationship and export boundary

Filter propagation follows only active, direction-compatible relationships. Ambiguous equal-length paths fail instead of silently joining unintended tables. Exported CSV protects cells that could be interpreted as spreadsheet formulas. HTML reports are static bounded snapshots and must be reviewed before external distribution.

## Workspace Trust

The extension is disabled in untrusted workspaces because a project can reference local files and execute analytical SQL.

## Reporting a vulnerability

Do not open a public issue for an undisclosed vulnerability. Use GitHub private vulnerability reporting for `StephaneSGL/vscode-bi-workbench` when available. Include affected version, reproduction, impact and mitigation without real credentials or private datasets.
