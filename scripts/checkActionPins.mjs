import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const workflowDirectory = path.resolve('.github', 'workflows');
const workflowFiles = (await readdir(workflowDirectory))
  .filter((file) => /\.ya?ml$/i.test(file))
  .sort();
const violations = [];

for (const file of workflowFiles) {
  const lines = (await readFile(path.join(workflowDirectory, file), 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    const action = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/)?.[1];
    if (!action || action.startsWith('./')) return;
    const reference = action.slice(action.lastIndexOf('@') + 1);
    if (!/^[0-9a-f]{40}$/i.test(reference)) {
      violations.push(`${file}:${index + 1}: ${action}`);
    }
  });
}

if (violations.length > 0) {
  throw new Error(`External GitHub Actions must use immutable 40-character commit SHAs:\n${violations.join('\n')}`);
}

console.log(`Verified immutable action pins in ${workflowFiles.length} workflow file(s).`);
