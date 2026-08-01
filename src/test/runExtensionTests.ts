import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'bi-workbench-vscode-test-'));
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspace, '--disable-extensions'],
      version: process.env.VSCODE_TEST_VERSION ?? '1.130.0',
      ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {})
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
