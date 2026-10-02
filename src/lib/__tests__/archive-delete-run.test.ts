process.env.STORAGE_PROVIDER = 'local';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { saveResult, archiveAndDeleteRun, listRunsForConfig, DELETED_RUNS_ARCHIVE_DIR } from '@/lib/storageService';
import { RESULTS_DIR, LIVE_DIR } from '@/cli/constants';

describe('archiveAndDeleteRun (local storage)', () => {
  const configId = 'test_config_archive_delete';
  const archiveName = 'test-archive';
  const keep = 'keep_2024-01-02T00-00-00Z_comparison.json';
  const remove = 'remove_2024-01-01T00-00-00Z_comparison.json';
  const configDir = path.join(RESULTS_DIR, LIVE_DIR, 'blueprints', configId);
  const archiveDir = path.join(RESULTS_DIR, DELETED_RUNS_ARCHIVE_DIR, archiveName);

  const sample = (runLabel: string, timestamp: string): any => ({
    configId,
    configTitle: 'Sample',
    runLabel,
    timestamp,
    config: { id: configId, title: 'Sample', models: ['modelA'], prompts: [] },
    effectiveModels: ['modelA'],
    promptIds: ['p1'],
    allFinalAssistantResponses: { p1: { modelA: 'Hello' } },
    evaluationResults: {
      llmCoverageScores: { p1: { modelA: { avgCoverageExtent: 0.5, pointAssessments: [] } } },
      similarityMatrix: {},
    },
  });

  beforeEach(async () => {
    await fs.rm(configDir, { recursive: true, force: true });
    await fs.rm(archiveDir, { recursive: true, force: true });
    await saveResult(configId, keep, sample('keep', '2024-01-02T00-00-00Z'));
    await saveResult(configId, remove, sample('remove', '2024-01-01T00-00-00Z'));
  });

  afterAll(async () => {
    await fs.rm(configDir, { recursive: true, force: true });
    await fs.rm(archiveDir, { recursive: true, force: true });
  });

  it('lists the comparison file and its artefacts on a dry run, and leaves them in place', async () => {
    const { keys, archivePrefix } = await archiveAndDeleteRun(configId, remove, archiveName, true);
    const runDir = path.join(LIVE_DIR, 'blueprints', configId, 'remove_2024-01-01T00-00-00Z');

    expect(archivePrefix).toBeNull();
    expect(keys[0]).toBe(path.join(LIVE_DIR, 'blueprints', configId, remove));
    expect(keys).toContain(path.join(runDir, 'core.json'));
    expect(keys.slice(1).every(k => k.startsWith(runDir + path.sep))).toBe(true);
    expect(fsSync.existsSync(path.join(RESULTS_DIR, keys[0]))).toBe(true);
    expect(fsSync.existsSync(archiveDir)).toBe(false);
  });

  it('copies the run to the archive, then deletes it and only it', async () => {
    const { keys, archivePrefix } = await archiveAndDeleteRun(configId, remove, archiveName, false);

    expect(archivePrefix).toBe(path.join(DELETED_RUNS_ARCHIVE_DIR, archiveName));
    for (const key of keys) {
      expect(fsSync.existsSync(path.join(RESULTS_DIR, key))).toBe(false);
      expect(fsSync.existsSync(path.join(RESULTS_DIR, archivePrefix!, key))).toBe(true);
    }
    expect(fsSync.existsSync(path.join(configDir, 'remove_2024-01-01T00-00-00Z'))).toBe(false);
    expect((await listRunsForConfig(configId)).map(r => r.fileName)).toEqual([keep]);
    expect(fsSync.existsSync(path.join(configDir, 'keep_2024-01-02T00-00-00Z', 'core.json'))).toBe(true);
  });

  it('throws for a run that does not exist, and for names that are not run files', async () => {
    await expect(archiveAndDeleteRun(configId, 'missing_2024-01-03T00-00-00Z_comparison.json', archiveName, false))
      .rejects.toThrow('Run not found');
    await expect(archiveAndDeleteRun(configId, `../${keep}`, archiveName, false)).rejects.toThrow('Not a run file name');
    expect((await listRunsForConfig(configId)).length).toBe(2);
  });
});
