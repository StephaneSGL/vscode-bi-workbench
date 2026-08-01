import assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('stephanesgl.vscode-bi-workbench');
  assert.ok(extension, 'The BI Workbench extension must be discoverable.');
  await extension.activate();
  assert.equal(extension.isActive, true, 'The extension must activate successfully.');
  const commands = await vscode.commands.getCommands(true);
  for (const command of ['biWorkbench.open', 'biWorkbench.createProject', 'biWorkbench.importData', 'biWorkbench.saveProject']) {
    assert.ok(commands.includes(command), `Expected command ${command} to be registered.`);
  }
  assert.equal(extension.packageJSON.version, '0.1.0');
  assert.equal(extension.packageJSON.capabilities.untrustedWorkspaces.supported, false);
}
