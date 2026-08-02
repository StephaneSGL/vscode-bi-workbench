import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const packages = [
  '@duckdb/node-api',
  '@duckdb/node-bindings',
  '@duckdb/node-bindings-win32-x64',
  'detect-libc',
  'echarts',
  'zrender',
  { name: 'tslib', directory: 'node_modules/echarts/node_modules/tslib' },
  'read-excel-file',
  '@xmldom/xmldom',
  'fflate',
  'unzipper',
  'bluebird',
  'duplexer2',
  'fs-extra',
  'graceful-fs',
  'node-int64',
  'universalify',
  'zod',
  'sql.js'
];

const licenseCandidates = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'LICENCE', 'COPYING'];
const sections = [];

for (const item of packages) {
  const name = typeof item === 'string' ? item : item.name;
  const directory = typeof item === 'string'
    ? path.join('node_modules', ...item.split('/'))
    : item.directory;
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  let licenseText;
  for (const candidate of licenseCandidates) {
    try {
      licenseText = await readFile(path.join(directory, candidate), 'utf8');
      break;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  if (!licenseText) throw new Error(`License file not found for ${name}.`);
  const normalizedLicense = licenseText.trim().replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
  sections.push(`${name} ${manifest.version} (${manifest.license ?? 'see included text'})\n${'-'.repeat(72)}\n${normalizedLicense}`);
}

const separator = `\n\n${'='.repeat(72)}\n\n`;
const output = `BI Workbench 0.2.0 third-party license texts\nGenerated deterministically by scripts/collectLicenses.mjs.\n\n${sections.join(separator)}\n`;
await writeFile('THIRD_PARTY_LICENSES.txt', output, 'utf8');
