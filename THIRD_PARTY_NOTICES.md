# Third-party notices

Runtime libraries used by BI Workbench v0.3.0, including libraries integrated into the JavaScript bundles:

| Package | Version | License | Project |
| --- | ---: | --- | --- |
| `@duckdb/node-api` | 1.5.5-r.3 | MIT | https://github.com/duckdb/duckdb-node-neo |
| `@duckdb/node-bindings` and Windows x64 binding | 1.5.5-r.3 | MIT | https://github.com/duckdb/duckdb-node-neo |
| `detect-libc` | 2.1.2 | Apache-2.0 | https://github.com/lovell/detect-libc |
| `echarts` | 6.1.0 | Apache-2.0 | https://github.com/apache/echarts |
| `zrender` | 6.1.0 | BSD-3-Clause | https://github.com/ecomfe/zrender |
| `tslib` | 2.3.0 | 0BSD | https://github.com/microsoft/tslib |
| `read-excel-file` | 8.0.3 | MIT | https://gitlab.com/catamphetamine/read-excel-file |
| `zod` | 4.4.3 | MIT | https://github.com/colinhacks/zod |
| `sql.js` | 1.14.1 | MIT | https://github.com/sql-js/sql.js |

The XLSX reader's bundled transitive libraries are `@xmldom/xmldom`, `fflate`, `unzipper`, `bluebird`, `duplexer2`, `fs-extra`, `graceful-fs`, `node-int64`, and `universalify`; their exact versions and license texts are included in `THIRD_PARTY_LICENSES.txt`.

Development-only tools and their licenses are recorded in `package-lock.json` and can be inspected with `npm query '*' --json` or an independent license scanner. The MIT-licensed `@microsoft/powerbi-report-authoring-cli` is pinned as a development-only validator and is not bundled in the VSIX. No Microsoft Power BI code, visual asset, or logo is bundled.
