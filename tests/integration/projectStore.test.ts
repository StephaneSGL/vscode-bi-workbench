import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore } from '../../src/core/projectStore.js';
import { createEmptyProject } from '../../src/shared/project.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('project store migrations', () => {
  it('backs up and atomically migrates a schema v1 project on open', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'bi-workbench-migration-'));
    temporaryDirectories.push(directory);
    const projectFile = path.join(directory, 'project.bi.json');
    const current = createEmptyProject('Legacy');
    const legacy = { ...current, schemaVersion: 1, theme: undefined };
    await writeFile(projectFile, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');

    const opened = await new ProjectStore().open(projectFile);

    expect(opened.project.schemaVersion).toBe(2);
    expect(opened.migratedFrom).toBe(1);
    expect(opened.migrationBackupFile).toBeTruthy();
    const backup = JSON.parse(await readFile(opened.migrationBackupFile ?? '', 'utf8')) as { schemaVersion: number };
    const migrated = JSON.parse(await readFile(projectFile, 'utf8')) as { schemaVersion: number };
    expect(backup.schemaVersion).toBe(1);
    expect(migrated.schemaVersion).toBe(2);
  });
});
