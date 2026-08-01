import * as vscode from 'vscode';
import type { ProjectManager } from '../core/projectManager.js';
import type { WorkbenchSection } from '../shared/state.js';

type TreeKind = 'project' | 'model' | 'reports';

interface NodeData {
  id: string;
  label: string;
  description?: string;
  icon: string;
  section: WorkbenchSection;
  children?: NodeData[];
}

class BiTreeItem extends vscode.TreeItem {
  constructor(readonly node: NodeData) {
    super(node.label, node.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    this.id = node.id;
    this.description = node.description;
    this.iconPath = new vscode.ThemeIcon(node.icon);
    this.tooltip = node.description ? `${node.label} — ${node.description}` : node.label;
    this.command = node.children ? undefined : {
      command: 'biWorkbench.open',
      title: 'Open in BI Workbench',
      arguments: [{ section: node.section, nodeId: node.id }]
    };
  }
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<BiTreeItem>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<BiTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.changes.event;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly manager: ProjectManager,
    private readonly kind: TreeKind
  ) {
    this.unsubscribe = manager.onDidChange(() => this.refresh());
  }

  getTreeItem(element: BiTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BiTreeItem): BiTreeItem[] {
    const project = this.manager.project;
    if (!project) {
      return [];
    }
    if (element?.node.children) {
      return element.node.children.map((child) => new BiTreeItem(child));
    }
    return this.roots().map((node) => new BiTreeItem(node));
  }

  refresh(): void {
    this.changes.fire();
  }

  dispose(): void {
    this.unsubscribe();
    this.changes.dispose();
  }

  private roots(): NodeData[] {
    const project = this.manager.project;
    if (!project) {
      return [];
    }
    if (this.kind === 'project') {
      return [
        {
          id: 'tables',
          label: 'Tables',
          description: String(project.tables.length),
          icon: 'table',
          section: 'data',
          children: project.tables.map((table) => ({
            id: table.id,
            label: table.name,
            description: `${table.rowCount.toLocaleString()} rows`,
            icon: table.kind === 'derived' ? 'symbol-method' : 'database',
            section: 'data'
          }))
        },
        {
          id: 'sources',
          label: 'Sources',
          description: String(project.sources.length),
          icon: 'file-symlink-file',
          section: 'import',
          children: project.sources.map((source) => ({
            id: source.id,
            label: source.name,
            description: source.kind.toUpperCase(),
            icon: 'file',
            section: 'import'
          }))
        },
        {
          id: 'queries',
          label: 'Saved queries',
          description: String(project.queries.length),
          icon: 'code',
          section: 'query',
          children: project.queries.map((query) => ({
            id: query.id,
            label: query.name,
            icon: 'terminal',
            section: 'query'
          }))
        }
      ];
    }
    if (this.kind === 'model') {
      return [
        {
          id: 'model-tables',
          label: 'Tables and columns',
          description: String(project.tables.length),
          icon: 'type-hierarchy',
          section: 'model',
          children: project.tables.map((table) => ({
            id: table.id,
            label: table.name,
            description: `${table.columns.length} columns`,
            icon: 'table',
            section: 'model',
            children: table.columns.map((column) => ({
              id: `${table.id}:${column.name}`,
              label: column.name,
              description: column.dataType,
              icon: 'symbol-field',
              section: 'model'
            }))
          }))
        },
        {
          id: 'relationships',
          label: 'Relationships',
          description: String(project.relationships.length),
          icon: 'references',
          section: 'model',
          children: project.relationships.map((relationship) => ({
            id: relationship.id,
            label: `${this.tableName(relationship.fromTableId)}.${relationship.fromColumn}`,
            description: `→ ${this.tableName(relationship.toTableId)}.${relationship.toColumn}`,
            icon: 'arrow-right',
            section: 'model'
          }))
        },
        {
          id: 'measures',
          label: 'Measures',
          description: String(project.measures.length),
          icon: 'symbol-operator',
          section: 'measures',
          children: project.measures.map((measure) => ({
            id: measure.id,
            label: measure.name,
            description: measure.format,
            icon: 'symbol-number',
            section: 'measures'
          }))
        }
      ];
    }
    return project.reports.map((report) => ({
      id: report.id,
      label: report.name,
      description: `${report.pages.length} page${report.pages.length === 1 ? '' : 's'}`,
      icon: 'graph',
      section: 'reports',
      children: report.pages.map((page) => ({
        id: page.id,
        label: page.name,
        description: `${page.visuals.length} visuals`,
        icon: 'dashboard',
        section: 'reports'
      }))
    }));
  }

  private tableName(tableId: string): string {
    return this.manager.project?.tables.find((table) => table.id === tableId)?.name ?? '?';
  }
}
