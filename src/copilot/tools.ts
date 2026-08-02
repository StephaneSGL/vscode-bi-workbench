import * as vscode from 'vscode';
import type { ProjectManager } from '../core/projectManager.js';
import { assertAggregateOnlyQuery, assertReadOnlyQuery } from '../core/sql.js';
import { VisualSchema } from '../shared/project.js';
import { schemaToolPayload, type DataSharingMode } from './context.js';

interface QueryToolInput {
  sql: string;
  purpose: string;
}

interface ConfigureVisualToolInput {
  reportId: string;
  pageId: string;
  purpose: string;
  visual: unknown;
}

interface CreateReportToolInput {
  name: string;
  description?: string;
  pageName: string;
  pageDescription?: string;
  purpose: string;
}

export function registerCopilotTools(context: vscode.ExtensionContext, manager: ProjectManager): void {
  const schemaTool: vscode.LanguageModelTool<Record<string, never>> = {
    invoke: () => new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(schemaToolPayload(manager))
    ])
  };

  const queryTool: vscode.LanguageModelTool<QueryToolInput> = {
    prepareInvocation: (options) => {
      const mode = sharingMode();
      return {
        invocationMessage: `Running a bounded BI query (${mode} sharing mode)`,
        confirmationMessages: {
          title: 'Share BI query result with the selected model?',
          message: new vscode.MarkdownString(`Purpose: **${escapeMarkdown(options.input.purpose)}**\n\nSharing mode: **${mode}**. The query is read-only and result-limited.`)
        }
      };
    },
    invoke: async (options, token) => {
      if (!manager.project) {
        return textResult({ error: 'No BI project is open.' });
      }
      const mode = sharingMode();
      if (mode === 'schema') {
        return textResult({
          error: 'The query tool is disabled in schema-only mode.',
          action: 'The user can change biWorkbench.copilotDataSharing to aggregates or samples if authorized.'
        });
      }
      if (token.isCancellationRequested) {
        return textResult({ error: 'Cancelled before query execution.' });
      }
      const sql = mode === 'aggregates'
        ? assertAggregateOnlyQuery(options.input.sql)
        : assertReadOnlyQuery(options.input.sql);
      const configuration = vscode.workspace.getConfiguration('biWorkbench');
      const limit = mode === 'samples'
        ? Math.max(1, Math.min(100, configuration.get('maxCopilotSampleRows', 20)))
        : 100;
      const result = await manager.runQuery(sql, limit);
      return textResult({
        sharingMode: mode,
        purpose: options.input.purpose,
        columns: result.columns,
        rows: result.rows,
        truncated: result.truncated,
        durationMs: result.durationMs
      });
    }
  };

  const configureVisualTool: vscode.LanguageModelTool<ConfigureVisualToolInput> = {
    prepareInvocation: (options) => {
      const parsed = VisualSchema.safeParse(options.input.visual);
      const description = parsed.success
        ? `Create or update **${escapeMarkdown(parsed.data.title)}** (${parsed.data.type}) after validating its real DuckDB query.`
        : 'Validate and apply a visualization configuration to the active BI project.';
      return {
        invocationMessage: 'Validating and applying a BI visualization',
        confirmationMessages: {
          title: 'Apply this visual to the BI project?',
          message: new vscode.MarkdownString(`${description}\n\nPurpose: **${escapeMarkdown(options.input.purpose)}**\n\nThis changes project metadata and may auto-save it. It never modifies imported source files.`)
        }
      };
    },
    invoke: async (options, token) => {
      if (!manager.project) {
        return textResult({ error: 'No BI project is open.' });
      }
      if (token.isCancellationRequested) {
        return textResult({ error: 'Cancelled before project changes.' });
      }
      const visual = VisualSchema.parse(options.input.visual);
      await manager.upsertVisual(options.input.reportId, options.input.pageId, visual);
      return textResult({
        applied: true,
        reportId: options.input.reportId,
        pageId: options.input.pageId,
        visual,
        validation: 'The visual query executed successfully before the project change was committed.'
      });
    }
  };

  const createReportTool: vscode.LanguageModelTool<CreateReportToolInput> = {
    prepareInvocation: (options) => ({
      invocationMessage: `Creating BI report ${options.input.name}`,
      confirmationMessages: {
        title: 'Create this BI report?',
        message: new vscode.MarkdownString(`Create **${escapeMarkdown(options.input.name)}** with page **${escapeMarkdown(options.input.pageName)}**.\n\nPurpose: **${escapeMarkdown(options.input.purpose)}**\n\nThis changes project metadata and may auto-save it.`)
      }
    }),
    invoke: async (options, token) => {
      if (!manager.project) {
        return textResult({ error: 'No BI project is open.' });
      }
      if (token.isCancellationRequested) {
        return textResult({ error: 'Cancelled before project changes.' });
      }
      const reportId = await manager.addReport(
        options.input.name,
        options.input.description ?? '',
        options.input.pageName,
        options.input.pageDescription ?? ''
      );
      const report = manager.project?.reports.find((item) => item.id === reportId);
      return textResult({
        applied: true,
        reportId,
        pageId: report?.pages[0]?.id,
        reportName: report?.name,
        pageName: report?.pages[0]?.name,
        next: 'Use #biConfigureVisual with these reportId and pageId values to add validated visuals.'
      });
    }
  };

  context.subscriptions.push(
    vscode.lm.registerTool('vscode-bi-workbench_getProjectSchema', schemaTool),
    vscode.lm.registerTool('vscode-bi-workbench_queryProject', queryTool),
    vscode.lm.registerTool('vscode-bi-workbench_configureVisual', configureVisualTool),
    vscode.lm.registerTool('vscode-bi-workbench_createReport', createReportTool)
  );
}

function sharingMode(): DataSharingMode {
  return vscode.workspace.getConfiguration('biWorkbench').get<DataSharingMode>('copilotDataSharing', 'schema');
}

function textResult(value: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(value, null, 2))
  ]);
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>-]/g, '\\$&').slice(0, 500);
}
