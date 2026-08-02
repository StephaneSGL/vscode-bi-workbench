import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { createStandaloneReportHtml, serializeCsv, serializeJson } from '../core/exportService.js';
import { Logger } from '../core/logger.js';
import { ProjectManager } from '../core/projectManager.js';
import { normalizePhysicalName } from '../core/sql.js';
import type { HostMessage, WebviewRequest } from '../shared/messages.js';
import type { QueryResult } from '../shared/project.js';
import { initialWorkbenchState, type WorkbenchSection } from '../shared/state.js';
import { WorkbenchPanel } from './workbenchPanel.js';
import { promptPowerBiExport } from './powerBiExportUi.js';

interface OpenFocus {
  section?: WorkbenchSection;
  nodeId?: string;
}

export class ExtensionController implements vscode.Disposable {
  readonly manager = new ProjectManager();
  readonly logger: Logger;
  readonly panel: WorkbenchPanel;
  private state = initialWorkbenchState();
  private readonly disposables: vscode.Disposable[] = [];
  private lastQueryResult?: QueryResult;
  private closing?: Promise<void>;
  private disposed = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel('BI Workbench');
    this.logger = new Logger(output);
    this.panel = new WorkbenchPanel(context.extensionUri);
    this.panel.setRequestHandler(async (request) => this.handleRequest(request));
    this.disposables.push(output, this.panel);
    const unsubscribe = this.manager.onDidChange(() => {
      this.syncProjectState();
      void this.postState();
    });
    this.disposables.push({ dispose: unsubscribe });
    this.refreshSettings();
  }

  registerCommands(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand('biWorkbench.open', async (focus?: OpenFocus) => this.open(focus)),
      vscode.commands.registerCommand('biWorkbench.createProject', async () => this.createProject()),
      vscode.commands.registerCommand('biWorkbench.openProject', async () => this.openProject()),
      vscode.commands.registerCommand('biWorkbench.openProjectFile', async (uri?: vscode.Uri) => {
        if (uri) {
          await this.openProject(uri.fsPath);
        }
      }),
      vscode.commands.registerCommand('biWorkbench.importData', async () => this.importData()),
      vscode.commands.registerCommand('biWorkbench.saveProject', async () => this.saveProject()),
      vscode.commands.registerCommand('biWorkbench.exportReport', async () => this.exportCurrentReport()),
      vscode.commands.registerCommand('biWorkbench.exportPowerBiProject', async () => this.exportPowerBiProject()),
      vscode.commands.registerCommand('biWorkbench.showLogs', () => this.logger.show()),
      vscode.commands.registerCommand('biWorkbench.openHelp', async () => this.openHelp())
    ];
  }

  registerConfigurationListener(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('biWorkbench')) {
        this.refreshSettings();
        void this.postState();
      }
    });
  }

  async open(focus?: OpenFocus): Promise<void> {
    this.panel.show();
    if (focus?.section) {
      this.state.activeSection = focus.section;
      this.applyNodeFocus(focus.nodeId);
    }
    if (this.state.activeSection === 'reports') {
      await this.reloadSelectedPage();
    }
    await this.postState();
  }

  async createProject(): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: 'BI Workbench: Create New Project',
      prompt: 'Project name',
      value: 'My BI Project',
      validateInput: (value) => value.trim() ? undefined : 'Enter a project name.'
    });
    if (!name) {
      this.logger.info('Create project cancelled before a project name was provided.');
      await vscode.window.showInformationMessage('BI Workbench: project creation cancelled. No project name was provided.');
      return;
    }
    const parentSelection = await vscode.window.showOpenDialog({
      title: 'Select the parent folder for the BI project',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
    });
    if (!parentSelection?.[0]) {
      this.logger.info('Create project cancelled before a parent folder was selected.');
      await vscode.window.showInformationMessage('BI Workbench: project creation cancelled. No parent folder was selected.');
      return;
    }
    const folderName = normalizePhysicalName(name, 'bi-project').replaceAll('_', '-');
    const projectDirectory = path.join(parentSelection[0].fsPath, folderName);
    await this.execute('Create project', async () => {
      await this.manager.create(projectDirectory, name.trim());
      await this.addRecent(this.manager.projectFile);
      this.state.activeSection = 'home';
      await this.updateEngineVersion();
      this.panel.show();
    }, `Created ${name.trim()}`);
  }

  async openProject(projectFile?: string): Promise<void> {
    let selected = projectFile;
    if (!selected) {
      const selection = await vscode.window.showOpenDialog({
        title: 'Open BI Project',
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'BI Workbench project': ['bi.json'], JSON: ['json'] },
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
      });
      selected = selection?.[0]?.fsPath;
    }
    if (!selected) {
      return;
    }
    await this.execute('Open project', async () => {
      await this.manager.open(selected);
      await this.addRecent(this.manager.projectFile);
      if (this.manager.migratedFrom !== undefined) {
        const backup = this.manager.migrationBackupFile ?? 'an adjacent backup file';
        this.logger.info(`Migrated project schema v${this.manager.migratedFrom} to v2. Backup: ${backup}`);
        await this.panel.post({
          type: 'toast',
          level: 'info',
          message: `Project upgraded to schema v2. The v${this.manager.migratedFrom} file was backed up before migration.`
        });
      }
      this.state.activeSection = 'home';
      this.state.preview = undefined;
      this.state.profiles = undefined;
      this.state.queryResult = undefined;
      this.state.visualData = [];
      await this.updateEngineVersion();
      this.panel.show();
    }, `Opened ${path.basename(selected)}`);
  }

  async importData(): Promise<void> {
    this.requireProject();
    const selection = await vscode.window.showOpenDialog({
      title: 'Import data into BI Workbench',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      filters: {
        'Supported data': ['csv', 'tsv', 'json', 'jsonl', 'ndjson', 'parquet', 'xlsx', 'duckdb', 'sqlite', 'sqlite3', 'db'],
        CSV: ['csv', 'tsv'],
        JSON: ['json', 'jsonl', 'ndjson'],
        Excel: ['xlsx'],
        Parquet: ['parquet'],
        DuckDB: ['duckdb'],
        'SQLite or DuckDB database': ['sqlite', 'sqlite3', 'db']
      },
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
    });
    if (!selection || selection.length === 0) {
      return;
    }
    await this.execute('Import data', async () => {
      for (const uri of selection) {
        this.logger.info(`Importing ${uri.fsPath}`);
        await this.manager.importFile(uri.fsPath);
      }
      this.state.activeSection = 'data';
      this.state.selectedTableId = this.manager.project?.tables.at(-1)?.id;
      if (this.state.selectedTableId) {
        this.state.preview = await this.manager.previewTable(this.state.selectedTableId, this.state.settings.previewRowLimit);
      }
    }, `Imported ${selection.length} source${selection.length === 1 ? '' : 's'}`);
  }

  async saveProject(): Promise<void> {
    this.requireProject();
    await this.execute('Save project', async () => this.manager.save(), 'Project saved');
  }

  async exportCurrentReport(): Promise<void> {
    const project = this.requireProject();
    const reportId = this.state.selectedReportId ?? project.reports[0]?.id;
    const report = project.reports.find((candidate) => candidate.id === reportId);
    const pageId = this.state.selectedPageId ?? report?.pages[0]?.id;
    if (!report || !pageId) {
      throw new Error('No report page is available to export.');
    }
    await this.exportReport(report.id, pageId);
  }

  async exportPowerBiProject(): Promise<void> {
    this.requireProject();
    try {
      const prompted = await promptPowerBiExport(this.manager, { confirmWrite: true });
      if (prompted.cancelled) return;
      const { result } = prompted;
      this.logger.info(`Power BI project exported: ${result.counts.tables} tables, ${result.counts.measures} measures, ${result.counts.visuals} visuals, ${result.warnings.length} warnings.`);
      for (const warning of result.warnings) this.logger.info(`Power BI export warning: ${warning}`);
      const action = await vscode.window.showInformationMessage(
        `Power BI project exported to ${path.basename(result.targetDirectory)} (${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}).`,
        'Open in Power BI',
        'Show in Folder',
        ...(result.warnings.length > 0 ? ['Show Warnings'] : [])
      );
      if (action === 'Open in Power BI') {
        await vscode.env.openExternal(vscode.Uri.file(result.pbipFile));
      } else if (action === 'Show in Folder') {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.pbipFile));
      } else if (action === 'Show Warnings') {
        this.logger.show();
      }
    } catch (error) {
      this.logger.error('Export Power BI project', error);
      await vscode.window.showErrorMessage(`Power BI export failed: ${this.errorMessage(error)}`);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closing = this.manager.close();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  async shutdown(): Promise<void> {
    this.dispose();
    await this.closing;
  }

  private async handleRequest(request: WebviewRequest): Promise<void> {
    switch (request.type) {
      case 'ready':
        await this.postState();
        return;
      case 'navigate':
        this.state.activeSection = request.section;
        if (request.section === 'reports') {
          await this.reloadSelectedPage();
        }
        await this.postState();
        return;
      case 'createProject':
        await this.createProject();
        return;
      case 'openProject':
        await this.openProject();
        return;
      case 'saveProject':
        await this.saveProject();
        return;
      case 'importData':
        await this.importData();
        return;
      case 'previewTable':
        await this.execute('Preview table', async () => {
          this.state.selectedTableId = request.tableId;
          this.state.preview = await this.manager.previewTable(request.tableId, this.state.settings.previewRowLimit);
          this.state.activeSection = 'data';
        });
        return;
      case 'profileTable':
        await this.execute('Profile table', async () => {
          this.state.selectedTableId = request.tableId;
          this.state.profiles = await this.manager.profileTable(request.tableId);
        });
        return;
      case 'runQuery':
        await this.execute('Run query', async () => {
          this.state.querySql = request.sql;
          this.lastQueryResult = await this.manager.runQuery(request.sql, this.state.settings.queryRowLimit);
          this.state.queryResult = this.lastQueryResult;
        });
        return;
      case 'cancelQuery':
        this.manager.engine.interrupt();
        await this.panel.post({ type: 'toast', level: 'warning', message: 'Query cancellation requested.' });
        return;
      case 'saveQuery':
        await this.execute('Save query', async () => {
          this.state.querySql = request.sql;
          await this.manager.saveQuery(request.name, request.sql);
        }, 'Query saved');
        return;
      case 'exportQuery':
        await this.exportQuery(request.format);
        return;
      case 'applyTransformations':
        await this.execute('Apply transformations', async () => {
          await this.manager.createDerivedTable(request.sourceTableId, request.targetName, request.steps);
          this.state.selectedTableId = this.manager.project?.tables.at(-1)?.id;
          this.state.activeSection = 'data';
        }, `Created derived table ${request.targetName}`);
        return;
      case 'upsertRelationship':
        await this.execute('Save relationship', async () => this.manager.upsertRelationship(request.relationship), 'Relationship saved');
        return;
      case 'deleteRelationship':
        await this.execute('Delete relationship', async () => this.manager.deleteRelationship(request.relationshipId), 'Relationship deleted');
        return;
      case 'updateTablePresentation':
        await this.execute('Update table presentation', async () => {
          await this.manager.updateTablePresentation(request.tableId, request.presentation);
        }, 'Table configuration saved');
        return;
      case 'updateTheme':
        await this.execute('Update report theme', async () => {
          await this.manager.updateTheme(request.theme);
          await this.reloadSelectedPage();
        }, 'Report theme saved');
        return;
      case 'upsertMeasure':
        await this.execute('Save measure', async () => {
          const preview = await this.manager.upsertMeasure(request.measure);
          await this.panel.post({ type: 'toast', level: 'info', message: `Measure validated. Current value: ${String(preview ?? 'NULL')}` });
        });
        return;
      case 'deleteMeasure':
        await this.execute('Delete measure', async () => this.manager.deleteMeasure(request.measureId), 'Measure deleted');
        return;
      case 'addReport':
        await this.execute('Add report', async () => {
          this.state.selectedReportId = await this.manager.addReport(request.name);
          this.state.selectedPageId = this.manager.project?.reports.find((report) => report.id === this.state.selectedReportId)?.pages[0]?.id;
          this.state.activeSection = 'reports';
          await this.reloadSelectedPage();
        });
        return;
      case 'addPage':
        await this.execute('Add page', async () => {
          this.state.selectedReportId = request.reportId;
          this.state.selectedPageId = await this.manager.addPage(request.reportId, request.name);
          await this.reloadSelectedPage();
        });
        return;
      case 'deleteReport':
        await this.execute('Delete report', async () => {
          await this.manager.deleteReport(request.reportId);
          this.selectDefaultReportPage();
          await this.reloadSelectedPage();
        });
        return;
      case 'deletePage':
        await this.execute('Delete page', async () => {
          await this.manager.deletePage(request.reportId, request.pageId);
          this.selectDefaultReportPage();
          await this.reloadSelectedPage();
        });
        return;
      case 'renameReport':
        await this.execute('Update report', async () => {
          await this.manager.renameReport(request.reportId, request.name, request.description);
        }, 'Report settings saved');
        return;
      case 'renamePage':
        await this.execute('Update report page', async () => {
          await this.manager.renamePage(request.reportId, request.pageId, request.name, request.description);
        }, 'Page settings saved');
        return;
      case 'upsertVisual':
        await this.execute('Save visual', async () => {
          await this.manager.upsertVisual(request.reportId, request.pageId, request.visual);
          this.state.selectedReportId = request.reportId;
          this.state.selectedPageId = request.pageId;
          await this.reloadSelectedPage();
        }, 'Visual saved');
        return;
      case 'deleteVisual':
        await this.execute('Delete visual', async () => {
          await this.manager.deleteVisual(request.reportId, request.pageId, request.visualId);
          await this.reloadSelectedPage();
        }, 'Visual deleted');
        return;
      case 'duplicateVisual':
        await this.execute('Duplicate visual', async () => {
          await this.manager.duplicateVisual(request.reportId, request.pageId, request.visualId);
          await this.reloadSelectedPage();
        }, 'Visual duplicated');
        return;
      case 'reorderVisual':
        await this.execute('Reorder visual', async () => {
          await this.manager.reorderVisual(request.reportId, request.pageId, request.visualId, request.toIndex);
          await this.reloadSelectedPage();
        });
        return;
      case 'upsertFilter':
        await this.execute('Save filter', async () => {
          await this.manager.upsertFilter(request.reportId, request.pageId, request.filter);
          await this.reloadSelectedPage();
        }, 'Filter applied');
        return;
      case 'deleteFilter':
        await this.execute('Delete filter', async () => {
          await this.manager.deleteFilter(request.reportId, request.pageId, request.filterId);
          await this.reloadSelectedPage();
        });
        return;
      case 'crossFilter':
        await this.execute('Cross-filter', async () => {
          await this.manager.setCrossFilter(request.reportId, request.pageId, {
            tableId: request.tableId,
            column: request.column,
            operator: request.operator,
            value: request.value
          });
          await this.reloadSelectedPage();
        });
        return;
      case 'clearTemporaryFilters':
        await this.execute('Clear interactions', async () => {
          await this.manager.clearTemporaryFilters(request.reportId, request.pageId);
          await this.reloadSelectedPage();
        });
        return;
      case 'loadPage':
        await this.execute('Load report page', async () => {
          this.state.selectedReportId = request.reportId;
          this.state.selectedPageId = request.pageId;
          this.state.activeSection = 'reports';
          await this.reloadSelectedPage();
        });
        return;
      case 'exportReport':
        await this.exportReport(request.reportId, request.pageId);
        return;
      case 'exportPowerBiProject':
        await this.exportPowerBiProject();
        return;
      case 'exportVisual':
        await this.exportVisual(request.reportId, request.pageId, request.visualId, request.format);
        return;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:stephanesgl.vscode-bi-workbench');
        return;
      case 'openCopilot':
        await vscode.commands.executeCommand('workbench.action.chat.open');
        return;
      case 'showLogs':
        this.logger.show();
        return;
      case 'openHelp':
        await this.openHelp();
        return;
    }
  }

  private async execute(operation: string, action: () => Promise<void>, successMessage?: string): Promise<void> {
    await this.panel.post({ type: 'operation', operation, status: 'started' });
    this.state.error = undefined;
    try {
      await action();
      this.syncProjectState();
      await this.postState();
      await this.panel.post({ type: 'operation', operation, status: 'finished', ...(successMessage ? { message: successMessage } : {}) });
      if (successMessage) {
        await this.panel.post({ type: 'toast', level: 'info', message: successMessage });
      }
      this.logger.info(`${operation} completed.`);
    } catch (error) {
      this.logger.error(operation, error);
      const message = this.errorMessage(error);
      this.state.error = message;
      await this.postState();
      await this.panel.post({ type: 'operation', operation, status: 'failed', message });
      await this.panel.post({ type: 'toast', level: 'error', message });
    }
  }

  private async exportQuery(format: 'csv' | 'json'): Promise<void> {
    if (!this.lastQueryResult) {
      await this.panel.post({ type: 'toast', level: 'warning', message: 'Run a query before exporting its result.' });
      return;
    }
    const uri = await vscode.window.showSaveDialog({
      title: `Export query result as ${format.toUpperCase()}`,
      filters: format === 'csv' ? { CSV: ['csv'] } : { JSON: ['json'] },
      saveLabel: 'Export'
    });
    if (!uri) {
      return;
    }
    await this.execute('Export query result', async () => {
      const content = format === 'csv'
        ? serializeCsv(this.lastQueryResult?.rows ?? [], this.lastQueryResult?.columns.map((column) => column.name))
        : serializeJson(this.lastQueryResult?.rows ?? []);
      await writeFile(uri.fsPath, content, 'utf8');
    }, `Exported ${path.basename(uri.fsPath)}`);
  }

  private async exportReport(reportId: string, pageId: string): Promise<void> {
    const project = this.requireProject();
    const report = project.reports.find((candidate) => candidate.id === reportId);
    const page = report?.pages.find((candidate) => candidate.id === pageId);
    if (!page) {
      throw new Error('Report page not found.');
    }
    const projectDirectory = this.manager.projectDirectory;
    if (!projectDirectory) {
      throw new Error('The project directory is unavailable.');
    }
    const exportFileName = `${normalizePhysicalName(project.name)}-${normalizePhysicalName(page.name)}.html`;
    const uri = await vscode.window.showSaveDialog({
      title: 'Export report page as standalone HTML',
      filters: { HTML: ['html'] },
      defaultUri: vscode.Uri.file(path.join(projectDirectory, exportFileName)),
      saveLabel: 'Export'
    });
    if (!uri) {
      return;
    }
    await this.execute('Export report', async () => {
      const data = await this.manager.loadPage(reportId, pageId);
      await writeFile(uri.fsPath, createStandaloneReportHtml(page, data, project.name), 'utf8');
    }, `Exported ${path.basename(uri.fsPath)}`);
  }

  private async exportVisual(reportId: string, pageId: string, visualId: string, format: 'csv' | 'json'): Promise<void> {
    const project = this.requireProject();
    const report = project.reports.find((candidate) => candidate.id === reportId);
    const page = report?.pages.find((candidate) => candidate.id === pageId);
    const visual = page?.visuals.find((candidate) => candidate.id === visualId);
    if (!page || !visual) {
      throw new Error('Visual not found.');
    }
    const data = (await this.manager.loadPage(reportId, pageId)).find((candidate) => candidate.visualId === visualId);
    if (!data || data.error) {
      throw new Error(data?.error ?? 'Visual data is unavailable.');
    }
    const columnNames = data.columns.map((column) => column.name).filter((name) => name !== '__sort');
    const rows = data.rows.map((row) => Object.fromEntries(columnNames.map((name) => [name, row[name]])));
    const extension = format === 'csv' ? 'csv' : 'json';
    const projectDirectory = this.manager.projectDirectory;
    const uri = await vscode.window.showSaveDialog({
      title: `Export ${visual.title} as ${format.toUpperCase()}`,
      filters: format === 'csv' ? { CSV: ['csv'] } : { JSON: ['json'] },
      defaultUri: projectDirectory ? vscode.Uri.file(path.join(projectDirectory, `${normalizePhysicalName(visual.title)}.${extension}`)) : undefined,
      saveLabel: 'Export'
    });
    if (!uri) return;
    await this.execute('Export visual data', async () => {
      const content = format === 'csv' ? serializeCsv(rows, columnNames) : serializeJson(rows);
      await writeFile(uri.fsPath, content, 'utf8');
    }, `Exported ${path.basename(uri.fsPath)}`);
  }

  private async openHelp(): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(this.context.extensionUri, 'README.md'));
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private refreshSettings(): void {
    const configuration = vscode.workspace.getConfiguration('biWorkbench');
    this.state.settings = {
      previewRowLimit: configuration.get('previewRowLimit', 500),
      queryRowLimit: configuration.get('queryRowLimit', 5000),
      copilotDataSharing: configuration.get('copilotDataSharing', 'schema'),
      maxCopilotSampleRows: configuration.get('maxCopilotSampleRows', 20),
      autoSave: configuration.get('autoSave', true)
    };
    this.manager.autoSave = this.state.settings.autoSave;
  }

  private syncProjectState(): void {
    const project = this.manager.project;
    if (project) {
      this.state.project = structuredClone(project);
      this.state.projectFile = this.manager.projectFile;
      this.state.dirty = this.manager.dirty;
      if (!this.state.selectedTableId || !project.tables.some((table) => table.id === this.state.selectedTableId)) {
        this.state.selectedTableId = project.tables[0]?.id;
      }
      if (!this.state.selectedReportId || !project.reports.some((report) => report.id === this.state.selectedReportId)) {
        this.state.selectedReportId = project.reports[0]?.id;
      }
      const selectedReport = project.reports.find((report) => report.id === this.state.selectedReportId);
      if (!this.state.selectedPageId || !selectedReport?.pages.some((page) => page.id === this.state.selectedPageId)) {
        this.state.selectedPageId = selectedReport?.pages[0]?.id;
      }
    } else {
      delete this.state.project;
      delete this.state.projectFile;
      delete this.state.selectedTableId;
      delete this.state.selectedReportId;
      delete this.state.selectedPageId;
      this.state.dirty = false;
    }
    this.state.recentProjects = this.context.globalState.get<string[]>('biWorkbench.recentProjects', []);
  }

  private async postState(): Promise<void> {
    this.syncProjectState();
    await this.panel.post({ type: 'state', state: structuredClone(this.state) });
  }

  private async updateEngineVersion(): Promise<void> {
    this.state.engineVersion = await this.manager.engine.version();
  }

  private async addRecent(projectFile?: string): Promise<void> {
    if (!projectFile) {
      return;
    }
    const previous = this.context.globalState.get<string[]>('biWorkbench.recentProjects', []);
    const recent = [projectFile, ...previous.filter((item) => item.toLowerCase() !== projectFile.toLowerCase())].slice(0, 10);
    await this.context.globalState.update('biWorkbench.recentProjects', recent);
    this.state.recentProjects = recent;
  }

  private applyNodeFocus(nodeId?: string): void {
    if (!nodeId || !this.manager.project) {
      return;
    }
    const project = this.manager.project;
    if (project.tables.some((table) => table.id === nodeId)) {
      this.state.selectedTableId = nodeId;
    }
    const report = project.reports.find((candidate) => candidate.id === nodeId);
    if (report) {
      this.state.selectedReportId = report.id;
      this.state.selectedPageId = report.pages[0]?.id;
    }
    for (const candidate of project.reports) {
      const page = candidate.pages.find((item) => item.id === nodeId);
      if (page) {
        this.state.selectedReportId = candidate.id;
        this.state.selectedPageId = page.id;
      }
    }
    const query = project.queries.find((candidate) => candidate.id === nodeId);
    if (query) {
      this.state.querySql = query.sql;
    }
  }

  private selectDefaultReportPage(): void {
    this.state.selectedReportId = this.manager.project?.reports[0]?.id;
    this.state.selectedPageId = this.manager.project?.reports[0]?.pages[0]?.id;
  }

  private async reloadSelectedPage(): Promise<void> {
    if (this.state.selectedReportId && this.state.selectedPageId) {
      this.state.visualData = await this.manager.loadPage(this.state.selectedReportId, this.state.selectedPageId);
    } else {
      this.state.visualData = [];
    }
  }

  private requireProject() {
    const project = this.manager.project;
    if (!project) {
      throw new Error('Create or open a BI project first.');
    }
    return project;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message.replaceAll(this.manager.projectDirectory ?? '\0', '<project>');
    }
    return String(error);
  }
}

export function toHostMessage(message: HostMessage): HostMessage {
  return message;
}
