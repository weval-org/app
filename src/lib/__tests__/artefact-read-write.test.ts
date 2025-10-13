process.env.STORAGE_PROVIDER = 'local';
import fs from 'fs/promises';
import path from 'path';
import {
  saveResult,
  getCoreResult,
  getPromptResponses,
  getCoverageResult,
} from '@/lib/storageService';
import {
  RESULTS_DIR,
  LIVE_DIR,
} from '@/cli/constants';

describe('artefact read/write round-trip', () => {
  const configId = 'test_config';
  const runLabel = 'testrun';
  const timestamp = '2024-01-01T00-00-00Z';
  const fileName = `${runLabel}_${timestamp}_comparison.json`;

  // minimal sample data
  const sampleData: any = {
    configId,
    configTitle: 'Sample',
    runLabel,
    timestamp,
    config: { id: configId, title: 'Sample', models: ['modelA'], prompts: [] },
    effectiveModels: ['modelA'],
    promptIds: ['p1'],
    allFinalAssistantResponses: { p1: { modelA: 'Hello' } },
    evaluationResults: {
      llmCoverageScores: {
        p1: {
          modelA: { avgCoverageExtent: 0.5, pointAssessments: [] },
        },
      },
      similarityMatrix: {},
    },
  };

  beforeAll(async () => {
    process.env.STORAGE_PROVIDER = 'local';
    await saveResult(configId, fileName, sampleData);
  });

  it('reads core.json artefact', async () => {
    const core = await getCoreResult(configId, runLabel, timestamp);
    expect(core).toBeTruthy();
    expect(core!.allFinalAssistantResponses).toHaveProperty('p1');
  });

  it('reads prompt responses artefact', async () => {
    const responses = await getPromptResponses(configId, runLabel, timestamp, 'p1');
    expect(responses).toEqual({ modelA: 'Hello' });
  });

  it('reads coverage artefact', async () => {
    const cov = await getCoverageResult(configId, runLabel, timestamp, 'p1', 'modelA');
    expect(cov).toMatchObject({ avgCoverageExtent: 0.5 });
  });
});
