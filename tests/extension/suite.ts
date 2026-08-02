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
  const tools = vscode.lm.tools.map((tool) => tool.name);
  for (const tool of [
    'vscode-bi-workbench_getProjectSchema',
    'vscode-bi-workbench_queryProject',
    'vscode-bi-workbench_configureVisual',
    'vscode-bi-workbench_createReport'
  ]) {
    assert.ok(tools.includes(tool), `Expected language-model tool ${tool} to be registered.`);
  }
  await vscode.commands.executeCommand('biWorkbench.open');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  const workbenchTab = tabs.find((tab) => tab.label === 'BI Workbench'
    || (tab.input instanceof vscode.TabInputWebview && tab.input.viewType === 'biWorkbench.main'));
  assert.ok(workbenchTab, `The Open command must create the BI Workbench webview tab. Visible tabs: ${tabs.map((tab) => tab.label).join(', ') || 'none'}`);
  assert.equal(extension.packageJSON.version, '0.2.0');
  assert.equal(extension.packageJSON.capabilities.untrustedWorkspaces.supported, false);
}
