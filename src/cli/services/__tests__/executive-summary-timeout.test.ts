import { vi } from 'vitest';

vi.mock('../llm-service', () => ({ getModelResponse: vi.fn() }));

import { generateExecutiveSummary } from '../executive-summary-service';
import { getModelResponse } from '../llm-service';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() } as any;

const result: any = {
    configId: 'example',
    configTitle: 'Example',
    runLabel: 'run',
    timestamp: '2026-09-30T18-23-35-456Z',
    config: { id: 'example', title: 'Example', models: ['openai:gpt-4o'], prompts: [{ id: 'p1', promptText: 'Hi', points: ['Says hi'] }] },
    promptIds: ['p1'],
    effectiveModels: ['openai:gpt-4o'],
    allFinalAssistantResponses: { p1: { 'openai:gpt-4o': 'Hello' } },
    evaluationResults: { llmCoverageScores: { p1: { 'openai:gpt-4o': { avgCoverageExtent: 1, keyPointsCount: 1, pointAssessments: [] } } } },
    evalMethodsUsed: ['llm-coverage'],
};

describe('generateExecutiveSummary', () => {
    it('gives the summarizer call more than the 30s client default', async () => {
        // A report for a large run (e.g. 36 models x 24 prompts, ~400k chars) cannot
        // be summarised within the OpenRouter client's default 30s timeout.
        vi.mocked(getModelResponse).mockResolvedValue('');

        await generateExecutiveSummary(result, logger);

        expect(getModelResponse).toHaveBeenCalledTimes(1);
        const params = vi.mocked(getModelResponse).mock.calls[0][0] as any;
        expect(params.timeout).toBeGreaterThanOrEqual(5 * 60 * 1000);
    });
});
