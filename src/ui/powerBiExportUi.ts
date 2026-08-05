import { stat } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import type { ProjectManager } from '../core/projectManager.js';
import { safePowerBiSegment, type PowerBiExportResult } from '../core/powerBiExportService.js';

export type PromptedPowerBiExport =
  | { cancelled: true }
  | { cancelled: false; result: PowerBiExportResult };

export async function promptPowerBiExport(
  manager: ProjectManager,
  options: { confirmWrite: boolean }
): Promise<PromptedPowerBiExport> {
  const project = manager.project;
  if (!project) {
    throw new Error('Create or open a BI project first.');
  }
  const selection = await vscode.window.showOpenDialog({
    title: 'Select the parent folder for the Power BI project',
    openLabel: 'Select export folder',
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: manager.projectDirectory ? vscode.Uri.file(manager.projectDirectory) : vscode.workspace.workspaceFolders?.[0]?.uri
  });
  const parent = selection?.[0]?.fsPath;
  if (!parent) return { cancelled: true };

  const folderBase = `${safePowerBiSegment(project.name, 'BI-Project')}-PowerBI`;
  const targetDirectory = await nextAvailableDirectory(parent, folderBase);
  if (options.confirmWrite) {
    const confirmed = await vscode.window.showWarningMessage(
      `Export a complete copy of all ${project.tables.length} table(s) to CSV and create a Power BI Desktop Project in "${path.basename(targetDirectory)}"? The exported files may contain sensitive data.`,
      { modal: true },
      'Export PBIP'
    );
    if (confirmed !== 'Export PBIP') return { cancelled: true };
  }

  return {
    cancelled: false,
    result: await manager.exportPowerBiProject(targetDirectory)
  };
}

async function nextAvailableDirectory(parent: string, folderBase: string): Promise<string> {
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const candidate = path.join(parent, suffix === 1 ? folderBase : `${folderBase}-${suffix}`);
    try {
      await stat(candidate);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return candidate;
      throw error;
    }
  }
  throw new Error(`No available Power BI export folder name was found under ${parent}.`);
}
