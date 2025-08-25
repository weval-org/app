import { buildMacroFlat } from '@/cli/services/macro-prep-service';

// Mocks
const saved: any = {
  index: null as any,
  configMappings: new Map<string, any>(),
  promptMappings: new Map<string, Map<string, any>>(),
  tiles: new Map<string, Uint8Array>(),
};

jest.mock('@/lib/storageService', () => {
  const real = jest.requireActual('@/lib/storageService');
  return {
    __esModule: true,
    ...real,
    getLatestRunsSummary: jest.fn(async () => ({ runs: [{ configId: 'cfg', configTitle: 'Cfg', runLabel: 'run', timestamp: '2025-01-01T00-00-00Z' }], lastUpdated: '' })),
    listConfigIds: jest.fn(async () => ['cfg']),
    listRunsForConfig: jest.fn(async () => [{ runLabel: 'run', timestamp: '2025-01-01T00-00-00Z', fileName: 'f' }]),
    getCoreResult: jest.fn(async () => ({
      promptIds: ['p1'],
      evaluationResults: {
        llmCoverageScores: {
          p1: {
            'openai:gpt-4o': {
              pointAssessments: [
                { coverageExtent: 1.0 },
                { coverageExtent: 0.0, isInverted: true },
              ],
            },
          },
        },
      },
    })),
    saveMacroFlatManifest: jest.fn(async (_: any) => {}),
    saveMacroFlatData: jest.fn(async (_: any) => {}),
  };
});

jest.mock('@/cli/config', () => ({
  getConfig: () => ({
    logger: {
      info: async () => {}, warn: async () => {}, error: async () => {}, success: async () => {},
    },
  }),
}));

describe('macro-prep-service buildMacroFlat', () => {
  it('builds flat artefacts without error', async () => {
    await expect(buildMacroFlat()).resolves.not.toThrow();
  });
});


