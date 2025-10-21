import { runLitRound } from '../core';
import type { LitParams, LitDependencies, LitProgressEvent, OnLitEvent } from '../types';
import { jest } from '@jest/globals';
import { configure } from '@/cli/config';
import type { ComparisonConfig } from '@/cli/types/cli_types';

// Mock external dependencies with relaxed typing
jest.mock('@/lib/cache-service', () => ({
  getCache: () => ({
    has: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  }),
  generateCacheKey: (payload: any) => JSON.stringify(payload),
}));

jest.mock('@/lib/llm-clients/client-dispatcher', () => ({
  dispatchMakeApiCall: jest.fn(),
}));
const { dispatchMakeApiCall } = require('@/lib/llm-clients/client-dispatcher') as { dispatchMakeApiCall: jest.Mock };

jest.mock('@/cli/services/comparison-pipeline-service.non-stream', () => ({
  generateAllResponses: jest.fn(),
}));
const { generateAllResponses } = require('@/cli/services/comparison-pipeline-service.non-stream') as { generateAllResponses: jest.Mock };

jest.mock('@/cli/evaluators/llm-coverage-evaluator', () => ({
  LLMCoverageEvaluator: jest.fn().mockImplementation(() => ({
    evaluate: jest.fn(),
  })),
}));
const { LLMCoverageEvaluator } = require('@/cli/evaluators/llm-coverage-evaluator') as { LLMCoverageEvaluator: jest.Mock };

jest.mock('@/cli/services/embedding-service', () => ({
  getEmbedding: jest.fn(),
}));
const { getEmbedding } = require('@/cli/services/embedding-service') as { getEmbedding: jest.Mock };


describe('LIT Core Logic', () => {
  let params: LitParams;
  let deps: LitDependencies;
  let mockOnEvent: jest.MockedFunction<OnLitEvent>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOnEvent = jest.fn() as any;

    params = {
      sourceText: 'The quick brown fox jumps over the lazy dog.',
      embeddingModel: 'test-embed-model',
      compilerModel: 'test-compiler-model',
      coverageModel: 'test-coverage-model',
      candidateModels: ['cand-model-1', 'cand-model-2'],
      anchorModels: ['anchor-model-1'],
      candTemp: 0.8,
      anchorTemp: 0.2,
      topN: 1,
      rankMode: 'composite',
      coverageWeight: 0.7,
      useGate: false,
      coverageThreshold: 0.8,
    };

    deps = ({
      buildCandidateConfig: jest.fn().mockReturnValue({ id: 'cand-config' } as any),
      buildAnchorConfig: jest.fn().mockReturnValue({ id: 'anchor-config' } as any),
    } as unknown) as LitDependencies;

    // Mock LLM responses for instruction set and coverage points
    dispatchMakeApiCall.mockImplementation(async (options: any) => {
      if (options.modelId === 'test-compiler-model') {
        return { responseText: 'Test instruction set' };
      }
      if (options.modelId === 'test-coverage-model') {
        return { responseText: 'Point 1\nPoint 2' };
      }
      return { error: 'Unknown model' };
    });

    // Mock generation responses
    generateAllResponses.mockImplementation(async (config: any) => {
      const responses = new Map();
      if (config.id === 'cand-config') {
        responses.set('cand', {
          modelResponses: {
            'cand-model-1': { finalAssistantResponseText: '<draft>Candidate 1</draft>' },
            'cand-model-2': { finalAssistantResponseText: '<draft>Candidate 2 is much longer</draft>' },
          },
        });
      }
      if (config.id === 'anchor-config') {
        responses.set('anchors', {
          modelResponses: {
            'anchor-model-1': { finalAssistantResponseText: '<draft>Anchor 1</draft>' },
          },
        });
      }
      return responses;
    });

    // Mock evaluator
    const mockEvaluator = new (LLMCoverageEvaluator as any)({}, false);
    (mockEvaluator.evaluate as any).mockResolvedValue({
      llmCoverageScores: {
        cand: {
          'cand-model-1': { avgCoverageExtent: 0.9 },
          'cand-model-2': { avgCoverageExtent: 0.7 },
        },
      },
    });
    (LLMCoverageEvaluator as any).mockReturnValue(mockEvaluator);

    // Mock embeddings
    (getEmbedding as any).mockImplementation(async (text: string): Promise<number[]> => {
      if (text.includes('fox')) return [1, 0, 0]; // source
      if (text.includes('Candidate 1')) return [0.9, 0.1, 0]; // cand1, high sim
      if (text.includes('Candidate 2')) return [0.2, 0.8, 0]; // cand2, low sim
      if (text.includes('Anchor 1')) return [0.8, 0.2, 0]; // anchor1, high sim
      return [0, 0, 0];
    });

    configure({
      errorHandler: jest.fn(),
      logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          success: jest.fn(),
      }
    } as any);
  });

  it('should run a full round and return correct artifacts', async () => {
    await runLitRound(params, deps, mockOnEvent);

    const artifacts = (mockOnEvent.mock.calls.find(call => call[0].type === 'completed')?.['0'] as LitProgressEvent)?.data?.artifacts as any;
    expect(artifacts).toBeDefined();

    expect(artifacts.instructionSet).toBe('Test instruction set');
    expect(artifacts.coveragePoints).toEqual(['Point 1', 'Point 2']);
    expect(artifacts.anchors).toHaveLength(1);
    expect(artifacts.candidates).toHaveLength(2);
    expect(artifacts.winners).toHaveLength(1);

    const winner = artifacts.winners[0];
    // Candidate 2 should win: low normSimilarity is prioritized in composite score
    expect(winner.modelId).toBe('cand-model-2');
    expect(winner.coverage).toBe(0.7);
    expect(winner.text).toBe('Candidate 2 is much longer');
    
    // Check ranking score calculation
    const cand1 = artifacts.candidatesSorted.find((c: any) => c.modelId === 'cand-model-1')!;
    const cand2 = artifacts.candidatesSorted.find((c: any) => c.modelId === 'cand-model-2')!;

    // cand1: cov=0.9, normSim is high (similar to source and anchor)
    // cand2: cov=0.7, normSim is low (dissimilar)
    // rankScore = 0.7*(1-coverage) + 0.3*normSimilarity
    // Lower rankScore is better. cand2 should have a lower rank score.
    expect(cand2.rankScore).toBeLessThan(cand1.rankScore!);

    expect(mockOnEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'instruction_finished' }));
    expect(mockOnEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'assertions_finished' }));
    expect(mockOnEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'generation_finished' }));
    expect(mockOnEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'coverage_finished' }));
    expect(mockOnEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'embedding_finished' }));
    expect(mockOnEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'ranking_finished' }));
    expect(mockOnEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'completed' }));
  });
});
