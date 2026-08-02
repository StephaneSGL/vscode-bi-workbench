import assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('stephanesgl.vscode-bi-workbench');
  assert.ok(extension, 'The BI Workbench extension must be discoverable.');
  await extension.activate();
  assert.equal(extension.isActive, true, 'The extension must activate successfully.');
  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'biWorkbench.open',
    'biWorkbench.createProject',
    'biWorkbench.importData',
    'biWorkbench.saveProject',
    'biWorkbench.exportPowerBiProject'
  ]) {
    assert.ok(commands.includes(command), `Expected command ${command} to be registered.`);
  }
  const tools = vscode.lm.tools.map((tool) => tool.name);
  for (const tool of [
    'vscode-bi-workbench_getProjectSchema',
    'vscode-bi-workbench_queryProject',
    'vscode-bi-workbench_configureVisual',
    'vscode-bi-workbench_createReport',
    'vscode-bi-workbench_exportPowerBiProject'
  ]) {
    assert.ok(tools.includes(tool), `Expected language-model tool ${tool} to be registered.`);
  }
  await vscode.commands.executeCommand('biWorkbench.open');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  const workbenchTab = tabs.find((tab) => tab.label === 'BI Workbench'
    || (tab.input instanceof vscode.TabInputWebview && tab.input.viewType === 'biWorkbench.main'));
  assert.ok(workbenchTab, `The Open command must create the BI Workbench webview tab. Visible tabs: ${tabs.map((tab) => tab.label).join(', ') || 'none'}`);
  const explorerViews = extension.packageJSON.contributes?.views?.explorer ?? [];
  for (const viewId of ['biWorkbench.projects', 'biWorkbench.model', 'biWorkbench.reports']) {
    const view = explorerViews.find((candidate: { id?: string; visibility?: string }) => candidate.id === viewId);
    assert.ok(view, `Expected ${viewId} to be contributed to the standard Explorer sidebar.`);
    assert.equal(view.visibility, 'visible', `Expected ${viewId} to be visible by default.`);
  }
  assert.equal(extension.packageJSON.icon, 'media/bi-workbench-logo.png');
  assert.equal(extension.packageJSON.galleryBanner?.color, '#0B1020');
  const icon = await vscode.workspace.fs.stat(vscode.Uri.joinPath(extension.extensionUri, extension.packageJSON.icon));
  assert.ok(icon.size > 0, 'The packaged extension icon must exist and be non-empty.');
  assert.equal(extension.packageJSON.version, '0.3.0');
  assert.equal(extension.packageJSON.capabilities.untrustedWorkspaces.supported, false);
}
