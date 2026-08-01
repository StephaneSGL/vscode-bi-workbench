import type { BiProject, ColumnProfile, QueryResult, VisualData } from './project.js';

export type WorkbenchSection =
  | 'home'
  | 'import'
  | 'data'
  | 'query'
  | 'transform'
  | 'model'
  | 'measures'
  | 'reports'
  | 'settings'
  | 'help';

export interface WorkbenchState {
  project?: BiProject;
  projectFile?: string;
  dirty: boolean;
  activeSection: WorkbenchSection;
  selectedTableId?: string;
  selectedReportId?: string;
  selectedPageId?: string;
  preview?: QueryResult;
  profiles?: ColumnProfile[];
  querySql: string;
  queryResult?: QueryResult;
  visualData: VisualData[];
  recentProjects: string[];
  settings: {
    previewRowLimit: number;
    queryRowLimit: number;
    copilotDataSharing: 'schema' | 'aggregates' | 'samples';
    maxCopilotSampleRows: number;
    autoSave: boolean;
  };
  engineVersion?: string;
  error?: string;
}

export function initialWorkbenchState(): WorkbenchState {
  return {
    dirty: false,
    activeSection: 'home',
    querySql: 'SELECT 42 AS answer;',
    visualData: [],
    recentProjects: [],
    settings: {
      previewRowLimit: 500,
      queryRowLimit: 5000,
      copilotDataSharing: 'schema',
      maxCopilotSampleRows: 20,
      autoSave: true
    }
  };
}
