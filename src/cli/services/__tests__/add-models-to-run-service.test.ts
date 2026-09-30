import { vi } from 'vitest';

vi.mock('@/lib/storageService', () => ({
  listRunsForConfig: vi.fn(),
  getResultByFileName: vi.fn(),
  getCoverageResult: vi.fn(),
  getConfigSummary: vi.fn(),
  saveConfigSummary: vi.fn(),
  updateSummaryDataWithNewRun: vi.fn(() => [{ configId: 'bp' }]),
}));
vi.mock('../comparison-pipeline-service', () => ({ executeComparisonPipeline: vi.fn() }));
vi.mock('../../commands/clone-run', async () => {
  const actual = await vi.importActual<any>('../../commands/clone-run');
  return { ...actual, generateResponseForPair: vi.fn() };
});

import * as storage from '@/lib/storageService';
import { executeComparisonPipeline } from '../comparison-pipeline-service';
import { generateResponseForPair } from '../../commands/clone-run';
import { addModelsToLatestRun, splitEffectiveId } from '../add-models-to-run-service';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const APERTUS = 'potluck:swiss-ai/apertus-v1.5-70b';

function sourceRun(overrides: any = {}) {
  return {
    configId: 'bp',
    config: {
      id: 'bp',
      title: 'Blueprint',
      models: ['openai:gpt-4o', 'openrouter:x-ai/grok-3'],
      prompts: [
        { id: 'p1', messages: [{ role: 'user', content: 'Q1' }], points: ['a'] },
        { id: 'p2', messages: [{ role: 'user', content: 'Q2' }], points: ['b'] },
      ],
    },
    // The pipeline stores responses under [temp:0] even when the blueprint sets no temperature.
    effectiveModels: ['openai:gpt-4o[temp:0]', 'openrouter:x-ai/grok-3[temp:0]'],
    allFinalAssistantResponses: {
      p1: { 'openai:gpt-4o[temp:0]': 'A1', 'openrouter:x-ai/grok-3[temp:0]': '<<error>>gone<</error>>' },
      p2: { 'openai:gpt-4o[temp:0]': 'A2', 'openrouter:x-ai/grok-3[temp:0]': '<<error>>gone<</error>>' },
    },
    errors: { p1: { 'openrouter:x-ai/grok-3[temp:0]': 'model retired' }, p2: { 'openrouter:x-ai/grok-3[temp:0]': 'model retired' } },
    modelSystemPrompts: { 'openai:gpt-4o[temp:0]': null },
    evaluationResults: {
      llmCoverageScores: {
        p1: { 'openai:gpt-4o[temp:0]': { avgCoverageExtent: 0.8, pointAssessments: [] }, 'openrouter:x-ai/grok-3[temp:0]': { error: 'no response' } },
        p2: { 'openai:gpt-4o[temp:0]': { avgCoverageExtent: 0.6, pointAssessments: [] } },
      },
    },
    evalMethodsUsed: ['embedding', 'llm-coverage'],
    sourceCommitSha: 'abc',
    ...overrides,
  };
}

describe('splitEffectiveId', () => {
  it('splits base model and variant suffix, preferring the longest base', () => {
    expect(splitEffectiveId('openai:gpt-4o-mini[temp:0]', ['openai:gpt-4o', 'openai:gpt-4o-mini'])).toEqual({ base: 'openai:gpt-4o-mini', suffix: '[temp:0]' });
    expect(splitEffectiveId('ideal', ['openai:gpt-4o'])).toBeNull();
  });
});

describe('addModelsToLatestRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.listRunsForConfig).mockResolvedValue([{ runLabel: 'old', timestamp: '2026-01-01T00-00-00-000Z', fileName: 'old_2026-01-01T00-00-00-000Z_comparison.json' }]);
    vi.mocked(storage.getResultByFileName).mockImplementation(async (_c, f) => (f.startsWith('old') ? sourceRun() : { configId: 'bp' }) as any);
    vi.mocked(generateResponseForPair).mockResolvedValue({ text: 'Apertus answer', history: [], hasError: false });
    vi.mocked(executeComparisonPipeline).mockResolvedValue({ data: {} as any, fileName: 'new_2026-09-30T00-00-00-000Z_comparison.json' });
  });

  it('asks only the added model, reuses every saved response and score, and keeps failures as failures', async () => {
    const result = await addModelsToLatestRun('bp', [APERTUS], logger);

    expect(result).toMatchObject({ status: 'added', reused: 2, generated: 2, generationErrors: 0 });
    // Only Apertus is asked, once per prompt, with the run's own variant suffix and temperature.
    expect(generateResponseForPair).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateResponseForPair).mock.calls.every(([p]) => p.modelId === APERTUS && p.temperature === 0)).toBe(true);

    const [config, , methods, , responseMap, , , commitSha, , , , , prefilled] = vi.mocked(executeComparisonPipeline).mock.calls[0] as any[];
    expect(config.models).toEqual(['openai:gpt-4o', 'openrouter:x-ai/grok-3', APERTUS]);
    expect(methods).toEqual(['embedding', 'llm-coverage']);
    expect(commitSha).toBe('abc');

    const p1 = responseMap.get('p1').modelResponses;
    expect(p1['openai:gpt-4o[temp:0]']).toMatchObject({ finalAssistantResponseText: 'A1', hasError: false });
    expect(p1['openrouter:x-ai/grok-3[temp:0]']).toMatchObject({ hasError: true, errorMessage: 'model retired' });
    expect(p1[`${APERTUS}[temp:0]`]).toMatchObject({ finalAssistantResponseText: 'Apertus answer', hasError: false });

    // Saved scores are prefilled so only Apertus gets judged.
    expect(Object.keys(prefilled.p1).sort()).toEqual(['openai:gpt-4o[temp:0]', 'openrouter:x-ai/grok-3[temp:0]']);
    expect(prefilled.p1[`${APERTUS}[temp:0]`]).toBeUndefined();

    expect(storage.saveConfigSummary).toHaveBeenCalledWith('bp', { configId: 'bp' });
  });

  it('skips a blueprint whose latest run already has the model', async () => {
    vi.mocked(storage.getResultByFileName).mockResolvedValue(sourceRun({ config: { ...sourceRun().config, models: ['openai:gpt-4o', APERTUS] } }) as any);

    const result = await addModelsToLatestRun('bp', [APERTUS], logger);

    expect(result.status).toBe('skipped');
    expect(generateResponseForPair).not.toHaveBeenCalled();
    expect(executeComparisonPipeline).not.toHaveBeenCalled();
  });

  it('publishes nothing when every request to the added model fails', async () => {
    vi.mocked(generateResponseForPair).mockResolvedValue({ text: '<<error>>x<</error>>', history: [], hasError: true, errorMessage: 'x' });

    const result = await addModelsToLatestRun('bp', [APERTUS], logger);

    expect(result.status).toBe('failed');
    expect(executeComparisonPipeline).not.toHaveBeenCalled();
    expect(storage.saveConfigSummary).not.toHaveBeenCalled();
  });

  it('skips blueprints with no published runs', async () => {
    vi.mocked(storage.listRunsForConfig).mockResolvedValue([]);
    expect((await addModelsToLatestRun('bp', [APERTUS], logger)).status).toBe('skipped');
  });
});
