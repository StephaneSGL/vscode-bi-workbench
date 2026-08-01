import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ProjectSchema, createEmptyProject, type BiProject } from '../shared/project.js';

export interface OpenedProject {
  project: BiProject;
  projectFile: string;
  projectDirectory: string;
  databaseFile: string;
}

export class ProjectStore {
  async create(projectDirectory: string, name: string): Promise<OpenedProject> {
    const resolvedDirectory = path.resolve(projectDirectory);
    await mkdir(resolvedDirectory, { recursive: true });
    const projectFile = path.join(resolvedDirectory, 'project.bi.json');
    try {
      await access(projectFile, constants.F_OK);
      throw new Error(`A BI project already exists at ${projectFile}.`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('A BI project')) {
        throw error;
      }
      if (!isMissingFileError(error)) {
        throw error;
      }
    }

    const project = createEmptyProject(name);
    await mkdir(path.join(resolvedDirectory, '.bi-workbench'), { recursive: true });
    await this.save(projectFile, project);
    return this.resolveOpened(projectFile, project);
  }

  async open(projectFile: string): Promise<OpenedProject> {
    const resolvedFile = path.resolve(projectFile);
    const fileStat = await stat(resolvedFile);
    if (!fileStat.isFile()) {
      throw new Error(`Project path is not a file: ${resolvedFile}`);
    }
    const raw = await readFile(resolvedFile, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Project JSON is invalid: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const project = ProjectSchema.parse(parsed);
    await mkdir(path.join(path.dirname(resolvedFile), '.bi-workbench'), { recursive: true });
    return this.resolveOpened(resolvedFile, project);
  }

  async save(projectFile: string, project: BiProject): Promise<BiProject> {
    const validated = ProjectSchema.parse({
      ...project,
      updatedAt: new Date().toISOString()
    });
    const directory = path.dirname(projectFile);
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.${path.basename(projectFile)}.${process.pid}.${crypto.randomUUID()}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await rename(temporary, projectFile);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return validated;
  }

  relativeSourceLocation(projectDirectory: string, sourcePath: string): string {
    const relative = path.relative(projectDirectory, sourcePath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative.replaceAll(path.sep, '/');
    }
    return path.resolve(sourcePath);
  }

  resolveSourceLocation(projectDirectory: string, storedLocation: string): string {
    return path.isAbsolute(storedLocation)
      ? storedLocation
      : path.resolve(projectDirectory, storedLocation.replaceAll('/', path.sep));
  }

  private resolveOpened(projectFile: string, project: BiProject): OpenedProject {
    const projectDirectory = path.dirname(projectFile);
    return {
      project,
      projectFile,
      projectDirectory,
      databaseFile: path.join(projectDirectory, '.bi-workbench', 'data.duckdb')
    };
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
