import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const fileName = `${manifest.name}-${manifest.version}.vsix`;
const filePath = path.join('artifacts', fileName);
const digest = createHash('sha256').update(await readFile(filePath)).digest('hex').toUpperCase();

await writeFile(path.join('artifacts', 'SHA256SUMS.txt'), `${digest} *${fileName}\n`, 'utf8');
