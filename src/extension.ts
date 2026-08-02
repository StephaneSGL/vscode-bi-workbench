import * as vscode from 'vscode';
import { registerCopilotParticipant } from './copilot/participant.js';
import { registerCopilotTools } from './copilot/tools.js';
import { ExtensionController } from './ui/extensionController.js';
import { ProjectTreeProvider } from './ui/projectTrees.js';

let controller: ExtensionController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  controller = new ExtensionController(context);
  const projectTree = new ProjectTreeProvider(controller.manager, 'project');
  const modelTree = new ProjectTreeProvider(controller.manager, 'model');
  const reportTree = new ProjectTreeProvider(controller.manager, 'reports');

  context.subscriptions.push(
    controller,
    ...controller.registerCommands(),
    controller.registerConfigurationListener(),
    projectTree,
    modelTree,
    reportTree,
    vscode.window.registerTreeDataProvider('biWorkbench.projects', projectTree),
    vscode.window.registerTreeDataProvider('biWorkbench.model', modelTree),
    vscode.window.registerTreeDataProvider('biWorkbench.reports', reportTree)
  );

  registerCopilotParticipant(context, controller.manager, controller.logger);
  registerCopilotTools(context, controller.manager);
  controller.logger.info('BI Workbench 0.2.0 activated. No telemetry is collected.');
}

export async function deactivate(): Promise<void> {
  const activeController = controller;
  controller = undefined;
  await activeController?.shutdown();
}
