import { vi } from 'vitest';
import { buildMacroFlat } from '@/cli/services/macro-prep-service';

// Mocks
const saved: any = {
  index: null as any,
  configMappings: new Map<string, any>(),
  promptMappings: new Map<string, Map<string, any>>(),
  tiles: new Map<string, Uint8Array>(),
};

vi.mock('@/lib/storageService', async () => {
  const real = await vi.importActual<typeof import('@/lib/storageService')>('@/lib/storageService');
  return {
    __esModule: true,
    ...real,
    getLatestRunsSummary: vi.fn(async () => ({ runs: [{ configId: 'cfg', configTitle: 'Cfg', runLabel: 'run', timestamp: '2025-01-01T00-00-00Z' }], lastUpdated: '' })),
    listConfigIds: vi.fn(async () => ['cfg']),
    listRunsForConfig: vi.fn(async () => [{ runLabel: 'run', timestamp: '2025-01-01T00-00-00Z', fileName: 'f' }]),
    getCoreResult: vi.fn(async () => ({
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
    saveMacroFlatManifest: vi.fn(async (_: any) => {}),
    saveMacroFlatData: vi.fn(async (_: any) => {}),
  };
});

vi.mock('@/cli/config', () => ({
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


