import type * as vscode from 'vscode';
import type { ProjectManager } from '../core/projectManager.js';

export type DataSharingMode = 'schema' | 'aggregates' | 'samples';

export async function buildCopilotContext(
  manager: ProjectManager,
  mode: DataSharingMode,
  maxSampleRows: number,
  token?: vscode.CancellationToken
): Promise<string> {
  const project = manager.project;
  if (!project) {
    throw new Error('No BI project is open.');
  }

  const context: Record<string, unknown> = {
    sharingMode: mode,
    project: {
      name: project.name,
      description: project.description,
      tables: project.tables.slice(0, 30).map((table) => ({
        id: table.id,
        name: table.name,
        physicalName: table.physicalName,
        kind: table.kind,
        rowCount: table.rowCount,
        columns: table.columns.slice(0, 80)
      })),
      relationships: project.relationships,
      measures: project.measures,
      savedQueries: project.queries.map((query) => ({ name: query.name, sql: query.sql })),
      reports: project.reports.map((report) => ({
        name: report.name,
        pages: report.pages.map((page) => ({
          name: page.name,
          filters: page.filters.filter((filter) => !filter.temporary),
          visuals: page.visuals
        }))
      }))
    },
    omitted: {
      tablesAfter: 30,
      columnsPerTableAfter: 80
    }
  };

  if (mode === 'aggregates' || mode === 'samples') {
    const summaries: Record<string, unknown> = {};
    for (const table of project.tables.slice(0, 8)) {
      if (token?.isCancellationRequested) {
        throw new Error('Copilot context generation was cancelled.');
      }
      const profiles = await manager.profileTable(table.id);
      summaries[table.name] = profiles.slice(0, 20).map((profile) => ({
        column: profile.column.name,
        type: profile.column.dataType,
        nullCount: profile.nullCount,
        distinctCount: profile.distinctCount,
        minimum: profile.minimum,
        maximum: profile.maximum,
        average: profile.average
      }));
    }
    context.aggregates = summaries;
  }

  if (mode === 'samples') {
    const samples: Record<string, unknown> = {};
    for (const table of project.tables.slice(0, 5)) {
      if (token?.isCancellationRequested) {
        throw new Error('Copilot context generation was cancelled.');
      }
      const preview = await manager.previewTable(table.id, Math.max(1, Math.min(100, maxSampleRows)));
      samples[table.name] = preview.rows;
    }
    context.samples = samples;
  }

  return JSON.stringify(context, null, 2);
}

export function schemaToolPayload(manager: ProjectManager): string {
  const project = manager.project;
  if (!project) {
    return JSON.stringify({ error: 'No BI project is open.' });
  }
  return JSON.stringify({
    project: project.name,
    tables: project.tables.map((table) => ({
      id: table.id,
      name: table.name,
      physicalName: table.physicalName,
      rowCount: table.rowCount,
      columns: table.columns
    })),
    relationships: project.relationships,
    measures: project.measures,
    reports: project.reports.map((report) => ({
      id: report.id,
      name: report.name,
      pages: report.pages.map((page) => ({ id: page.id, name: page.name, visuals: page.visuals, filters: page.filters }))
    }))
  }, null, 2);
}
