import * as vscode from 'vscode';
import type { ProjectManager } from '../core/projectManager.js';
import { assertReadOnlyQuery } from '../core/sql.js';
import { schemaToolPayload, type DataSharingMode } from './context.js';

interface QueryToolInput {
  sql: string;
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
      const sql = assertReadOnlyQuery(options.input.sql);
      if (mode === 'aggregates' && !looksAggregate(sql)) {
        return textResult({
          error: 'Aggregate sharing mode only allows queries containing an aggregate function and rejects SELECT *.',
          action: 'Use COUNT, SUM, AVG, MIN, MAX, APPROX_COUNT_DISTINCT, or a grouped aggregate.'
        });
      }
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

  context.subscriptions.push(
    vscode.lm.registerTool('vscode-bi-workbench_getProjectSchema', schemaTool),
    vscode.lm.registerTool('vscode-bi-workbench_queryProject', queryTool)
  );
}

function sharingMode(): DataSharingMode {
  return vscode.workspace.getConfiguration('biWorkbench').get<DataSharingMode>('copilotDataSharing', 'schema');
}

function looksAggregate(sql: string): boolean {
  return !/\bselect\s+\*/i.test(sql)
    && /\b(count|sum|avg|min|max|median|quantile|stddev|variance|approx_count_distinct)\s*\(/i.test(sql);
}

function textResult(value: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(value, null, 2))
  ]);
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>-]/g, '\\$&').slice(0, 500);
}
