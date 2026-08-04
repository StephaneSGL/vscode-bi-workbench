# Graphy codebase analysis — vscode-bi-workbench

This report is generated from the files tracked by Git. It provides an accessible text equivalent of the image shown in the repository README.

## File structure summary

- Tracked files: **66**
- Folders: **19**
- File types: **13**
- Source commit: `5fa7f1eaaa1b`

## File types

| Type | Files |
|---|---:|
| `.ts` | 34 |
| `.md` | 10 |
| `.json` | 8 |
| `.mjs` | 5 |
| `.gitattributes` | 1 |
| `.yml` | 1 |
| `.gitignore` | 1 |
| `.vscodeignore` | 1 |
| `no extension` | 1 |
| `.svg` | 1 |
| `.css` | 1 |
| `.txt` | 1 |
| `.mts` | 1 |

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
├── docs/  (4 files)
│   ├── ARCHITECTURE.md
│   ├── RESEARCH.md
│   ├── ROADMAP.md
│   └── UI_SPEC.md
├── media/  (1 files)
│   └── bi-workbench.svg
├── schemas/  (1 files)
│   └── project.schema.json
├── scripts/  (3 files)
│   ├── clean.mjs
│   ├── collectLicenses.mjs
│   └── ensureArtifacts.mjs
├── src/  (26 files)
│   ├── copilot/  (3 files)
│   │   ├── context.ts
│   │   ├── participant.ts
│   │   └── tools.ts
│   ├── core/  (10 files)
│   │   ├── duckdbEngine.ts
│   │   ├── exportService.ts
│   │   ├── importService.ts
│   │   ├── logger.ts
│   │   ├── modelService.ts
│   │   ├── projectManager.ts
│   │   ├── projectStore.ts
│   │   ├── reportService.ts
│   │   ├── sql.ts
│   │   └── transformationService.ts
│   ├── shared/  (3 files)
│   │   ├── messages.ts
│   │   ├── project.ts
│   │   └── state.ts
│   ├── test/  (1 files)
│   │   └── runExtensionTests.ts
│   ├── ui/  (3 files)
│   │   ├── extensionController.ts
│   │   ├── projectTrees.ts
│   │   └── workbenchPanel.ts
│   ├── webview/  (4 files)
│   │   ├── charts.ts
│   │   ├── main.ts
│   │   ├── render.ts
│   │   └── styles.css
│   ├── extension.ts
│   └── types.d.ts
├── tests/  (9 files)
│   ├── extension/  (1 files)
│   │   └── suite.ts
│   ├── integration/  (3 files)
│   │   ├── engine.test.ts
│   │   ├── imports.test.ts
│   │   └── projectManager.test.ts
│   ├── ui/  (1 files)
│   │   └── render.test.ts
│   └── unit/  (4 files)
│       ├── export.test.ts
│       ├── messages.test.ts
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
