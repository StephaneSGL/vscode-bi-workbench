# Graphy codebase analysis — vscode-bi-workbench

This report is generated from the files tracked by Git. It provides an accessible text equivalent of the image shown in the repository README.

## File structure summary

- Tracked files: **81**
- Folders: **20**
- File types: **14**
- Source commit: `9c140c339f36`

## File types

| Type | Files |
|---|---:|
| `.ts` | 43 |
| `.md` | 12 |
| `.json` | 8 |
| `.mjs` | 6 |
| `.png` | 2 |
| `.svg` | 2 |
| `.css` | 1 |
| `.gitattributes` | 1 |
| `.gitignore` | 1 |
| `.mts` | 1 |
| `.txt` | 1 |
| `.vscodeignore` | 1 |
| `.yml` | 1 |
| `no extension` | 1 |

## Directory tree

```text
vscode-bi-workbench/
├── .github/  (1 files)
│   └── workflows/  (1 files)
│       └── ci.yml
├── .vscode/  (3 files)
│   ├── extensions.json
│   ├── launch.json
│   └── tasks.json
├── docs/  (7 files)
│   ├── graphy/  (2 files)
│   │   ├── Graphy.md
│   │   └── overview.png
│   ├── ARCHITECTURE.md
│   ├── COMPLETION_AUDIT.md
│   ├── RESEARCH.md
│   ├── ROADMAP.md
│   └── UI_SPEC.md
├── media/  (3 files)
│   ├── bi-workbench-logo.png
│   ├── bi-workbench-logo.svg
│   └── bi-workbench.svg
├── schemas/  (1 files)
│   └── project.schema.json
├── scripts/  (4 files)
│   ├── clean.mjs
│   ├── collectLicenses.mjs
│   ├── ensureArtifacts.mjs
│   └── writeChecksum.mjs
├── src/  (29 files)
│   ├── copilot/  (3 files)
│   │   ├── context.ts
│   │   ├── participant.ts
│   │   └── tools.ts
│   ├── core/  (11 files)
│   │   ├── duckdbEngine.ts
│   │   ├── exportService.ts
│   │   ├── importService.ts
│   │   ├── logger.ts
│   │   ├── modelService.ts
│   │   ├── powerBiExportService.ts
│   │   ├── projectManager.ts
│   │   ├── projectStore.ts
│   │   ├── reportService.ts
│   │   ├── sql.ts
│   │   └── transformationService.ts
│   ├── shared/  (4 files)
│   │   ├── messages.ts
│   │   ├── presentation.ts
│   │   ├── project.ts
│   │   └── state.ts
│   ├── test/  (1 files)
│   │   └── runExtensionTests.ts
│   ├── ui/  (4 files)
│   │   ├── extensionController.ts
│   │   ├── powerBiExportUi.ts
│   │   ├── projectTrees.ts
│   │   └── workbenchPanel.ts
│   ├── webview/  (4 files)
│   │   ├── charts.ts
│   │   ├── main.ts
│   │   ├── render.ts
│   │   └── styles.css
│   ├── extension.ts
│   └── types.d.ts
├── tests/  (15 files)
│   ├── extension/  (1 files)
│   │   └── suite.ts
│   ├── integration/  (6 files)
│   │   ├── engine.test.ts
│   │   ├── imports.test.ts
│   │   ├── powerBiExport.test.ts
│   │   ├── projectManager.test.ts
│   │   ├── projectStore.test.ts
│   │   └── relationshipFilters.test.ts
│   ├── ui/  (2 files)
│   │   ├── main.test.ts
│   │   └── render.test.ts
│   └── unit/  (6 files)
│       ├── copilotContext.test.ts
│       ├── export.test.ts
│       ├── messages.test.ts
│       ├── powerBiExport.test.ts
│       ├── project.test.ts
│       └── sql.test.ts
├── .gitattributes
├── .gitignore
├── .vscodeignore
├── CHANGELOG.md
├── CONTRIBUTING.md
├── esbuild.mjs
├── eslint.config.mjs
├── language-configuration.json
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── SECURITY.md
├── TEST_REPORT.md
├── THIRD_PARTY_LICENSES.txt
├── THIRD_PARTY_NOTICES.md
├── tsconfig.json
└── vitest.config.mts
```

The tree is intentionally bounded for readability. GitHub’s **Code** view remains the authoritative complete tree.
