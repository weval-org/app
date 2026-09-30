/**
 * @vitest-environment node
 */
import { vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/cli/services/comparison-pipeline-service', () => ({ executeComparisonPipeline: vi.fn() }));
vi.mock('@/cli/commands/backfill-summary', () => ({ actionBackfillSummary: vi.fn() }));
vi.mock('@/cli/services/pairwise-task-queue-service', () => ({ populatePairwiseQueue: vi.fn() }));
vi.mock('@/lib/storageService', () => ({
  getHomepageSummary: vi.fn(),
  saveHomepageSummary: vi.fn(),
  getResultByFileName: vi.fn(),
  getConfigSummary: vi.fn(),
  saveConfigSummary: vi.fn(),
  updateSummaryDataWithNewRun: vi.fn(),
}));
vi.mock('@/lib/background-function-auth', () => ({ checkBackgroundAuth: vi.fn(() => null) }));
vi.mock('@/utils/sentry', () => ({
  initSentry: vi.fn(),
  captureError: vi.fn(),
  setContext: vi.fn(),
  flushSentry: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({
  getLogger: vi.fn(async () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { POST } from '../route';
import { executeComparisonPipeline } from '@/cli/services/comparison-pipeline-service';
import { actionBackfillSummary } from '@/cli/commands/backfill-summary';
import * as storage from '@/lib/storageService';
import { getConfig } from '@/cli/config';

const CONFIG_ID = 'users__someone__example';
const FILE_NAME = 'abc123_2026-09-30T14-35-55-272Z_comparison.json';

function request() {
  return new NextRequest('http://localhost:3172/api/internal/execute-evaluation-background', {
    method: 'POST',
    body: JSON.stringify({
      config: { id: CONFIG_ID, title: 'Example', models: ['openai:gpt-4o-mini'], prompts: [] },
      commitSha: 'deadbeef',
    }),
  });
}

describe('POST /api/internal/execute-evaluation-background', () => {
  const originalProvider = process.env.STORAGE_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STORAGE_PROVIDER = 's3';
    vi.mocked(executeComparisonPipeline).mockResolvedValue({ data: {} as any, fileName: FILE_NAME });
    vi.mocked(storage.getResultByFileName).mockResolvedValue({ configId: CONFIG_ID } as any);
    vi.mocked(storage.getConfigSummary).mockResolvedValue(null);
    vi.mocked(storage.updateSummaryDataWithNewRun).mockReturnValue([{ configId: CONFIG_ID } as any]);
  });

  afterEach(() => {
    process.env.STORAGE_PROVIDER = originalProvider;
  });

  it('publishes the run: saves the config summary and rebuilds site summaries', async () => {
    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(storage.getResultByFileName).toHaveBeenCalledWith(CONFIG_ID, FILE_NAME);
    expect(storage.updateSummaryDataWithNewRun).toHaveBeenCalledWith(null, { configId: CONFIG_ID }, FILE_NAME);
    expect(storage.saveConfigSummary).toHaveBeenCalledWith(CONFIG_ID, { configId: CONFIG_ID });
    expect(actionBackfillSummary).toHaveBeenCalledWith({ verbose: false, dryRun: false });
    expect((await res.json()).output).toBe(FILE_NAME);
  });

  it('keeps the config summary when the site-wide rebuild fails', async () => {
    vi.mocked(actionBackfillSummary).mockRejectedValue(new Error('rebuild failed'));

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(storage.saveConfigSummary).toHaveBeenCalledWith(CONFIG_ID, { configId: CONFIG_ID });
  });

  it('configures the CLI before running the pipeline', async () => {
    // The real pipeline and LLM clients call getConfig(); on a fresh server
    // process nothing else has configured it yet.
    vi.mocked(executeComparisonPipeline).mockImplementation(async () => {
      getConfig().logger.info('pipeline running');
      return { data: {} as any, fileName: FILE_NAME };
    });

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(storage.saveConfigSummary).toHaveBeenCalled();
  });

  it('returns 500 when the pipeline saved nothing', async () => {
    vi.mocked(executeComparisonPipeline).mockResolvedValue({ data: {} as any, fileName: null });

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(storage.saveConfigSummary).not.toHaveBeenCalled();
    expect(actionBackfillSummary).not.toHaveBeenCalled();
  });
});
