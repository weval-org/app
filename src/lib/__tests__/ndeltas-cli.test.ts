import * as storageService from '@/lib/storageService';
import { actionGenerateNDeltas } from '@/cli/commands/generate-ndeltas';

jest.mock('@/cli/config', () => ({
  getConfig: jest.fn(() => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    },
  })),
}));

jest.mock('@/lib/storageService', () => {
  const actual = jest.requireActual('@/lib/storageService');
  return {
    ...actual,
    listConfigIds: jest.fn(),
    listRunsForConfig: jest.fn(),
    getResultByFileName: jest.fn(),
    saveModelNDeltas: jest.fn(),
  };
});

const mockedStorage = storageService as jest.Mocked<typeof storageService>;

describe('NDeltas CLI (coverage-only, base-aggregated)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes deltas for a base model across latest runs (aggregating variants, averaging peers by base)', async () => {
    mockedStorage.listConfigIds.mockResolvedValue(['cfgA']);
    mockedStorage.listRunsForConfig.mockResolvedValue([
      { runLabel: 'runA', timestamp: '2024-01-01T00-00-00Z', fileName: 'runA_2024-01-01T00-00-00Z_comparison.json' },
    ]);

    // effectiveModels include variants and IDEAL
    const runData: any = {
      configId: 'cfgA',
      config: { title: 'Cfg A' },
      configTitle: 'Cfg A',
      runLabel: 'runA',
      timestamp: '2024-01-01T00-00-00Z',
      effectiveModels: [
        'openai:gpt-4o[temp:0.0]',
        'openai:gpt-4o[temp:0.7]',
        'anthropic:claude-3-5-sonnet',
        'xai:grok-3',
        'IDEAL_BENCHMARK',
      ],
      promptIds: ['p1', 'p2'],
      evaluationResults: {
        llmCoverageScores: {
          p1: {
            'openai:gpt-4o[temp:0.0]': { avgCoverageExtent: 0.6 },
            'openai:gpt-4o[temp:0.7]': { avgCoverageExtent: 0.7 },
            'anthropic:claude-3-5-sonnet': { avgCoverageExtent: 0.8 },
            'xai:grok-3': { avgCoverageExtent: 0.9 },
          },
          p2: {
            'openai:gpt-4o[temp:0.0]': { avgCoverageExtent: 0.5 },
            'openai:gpt-4o[temp:0.7]': { avgCoverageExtent: 0.6 },
            'anthropic:claude-3-5-sonnet': { avgCoverageExtent: 0.7 },
            'xai:grok-3': { avgCoverageExtent: 0.4 },
          },
        },
      },
    };
    mockedStorage.getResultByFileName.mockResolvedValue(runData);

    await actionGenerateNDeltas('gpt-4o', { dryRun: false, minPeers: 1, limit: 100 });

    // Verify save was called with base core id and entries sorted by delta
    expect(mockedStorage.saveModelNDeltas).toHaveBeenCalledTimes(1);
    const [savedModelId, payload] = mockedStorage.saveModelNDeltas.mock.calls[0];
    expect(savedModelId).toBe('gpt-4o');

    const data = payload as any;
    expect(data.modelId).toBe('gpt-4o');
    // There are 2 prompts; target avg for p1 = (0.6+0.7)/2=0.65; peers base avgs: claude=0.8, grok=0.9 -> peerAvg=0.85; delta=-0.20
    // p2: target avg=(0.5+0.6)/2=0.55; peers: claude=0.7, grok=0.4 -> peerAvg=0.55; delta=0.0
    const byPrompt: Record<string, number> = Object.fromEntries(data.entries.map((e: any) => [e.promptId, e.delta]));
    expect(byPrompt['p1']).toBeCloseTo(-0.2, 5);
    expect(byPrompt['p2']).toBeCloseTo(0.0, 5);
  });

  it('includes prompt/response context fields on entries', async () => {
    mockedStorage.listConfigIds.mockResolvedValue(['cfgB']);
    mockedStorage.listRunsForConfig.mockResolvedValue([
      { runLabel: 'runB', timestamp: '2024-01-02T00-00-00Z', fileName: 'runB_2024-01-02T00-00-00Z_comparison.json' },
    ]);

    const runData: any = {
      configId: 'cfgB',
      config: { title: 'Cfg B', prompts: [{ id: 'p1', promptText: 'Hello world' }] },
      configTitle: 'Cfg B',
      runLabel: 'runB',
      timestamp: '2024-01-02T00-00-00Z',
      effectiveModels: [ 'openai:gpt-4o[temp:0.0]', 'anthropic:claude-3', 'IDEAL_BENCHMARK' ],
      promptIds: ['p1'],
      allFinalAssistantResponses: { p1: { 'openai:gpt-4o[temp:0.0]': 'Final answer' } },
      modelSystemPrompts: { 'openai:gpt-4o[temp:0.0]': 'You are helpful.' },
      evaluationResults: { llmCoverageScores: { p1: { 'openai:gpt-4o[temp:0.0]': { avgCoverageExtent: 0.2 }, 'anthropic:claude-3': { avgCoverageExtent: 0.8 } } } },
    };
    mockedStorage.getResultByFileName.mockResolvedValue(runData);

    await actionGenerateNDeltas('gpt-4o', { dryRun: false, minPeers: 1, limit: 100 });
    const [, payload] = mockedStorage.saveModelNDeltas.mock.calls.pop()!;
    const entry = (payload as any).entries[0];
    expect(entry.promptContext).toBeDefined();
    expect(entry.finalResponse).toBe('Final answer');
    expect(entry.systemPromptUsed).toBe('You are helpful.');
    // temp parsed from variant id [temp:0.0] -> 0.0
    expect(entry.temperatureUsed).toBe(0.0);
  });

  it('supports --all-models with min thresholds and does not throw when none match', async () => {
    mockedStorage.listConfigIds.mockResolvedValue([]);
    await actionGenerateNDeltas('', { allModels: true, minRuns: 2, minPeers: 2, dryRun: true });
    expect(true).toBe(true);
  });
});


