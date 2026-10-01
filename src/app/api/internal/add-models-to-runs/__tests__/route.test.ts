/**
 * @vitest-environment node
 */
import { vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/cli/services/add-models-to-run-service', () => ({ addModelsToLatestRun: vi.fn() }));
vi.mock('@/cli/commands/backfill-summary', () => ({ actionBackfillSummary: vi.fn() }));
vi.mock('@/lib/background-function-auth', () => ({ checkBackgroundAuth: vi.fn(() => null) }));
vi.mock('@/utils/logger', () => ({
  getLogger: vi.fn(async () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { POST } from '../route';
import { addModelsToLatestRun } from '@/cli/services/add-models-to-run-service';
import { actionBackfillSummary } from '@/cli/commands/backfill-summary';
import { checkBackgroundAuth } from '@/lib/background-function-auth';

const APERTUS = 'potluck:swiss-ai/apertus-v1.5-70b';
const request = (body: unknown) =>
  new NextRequest('http://localhost:3172/api/internal/add-models-to-runs', { method: 'POST', body: JSON.stringify(body) });
const flush = () => new Promise(r => setTimeout(r, 0));

describe('POST /api/internal/add-models-to-runs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts, works through each blueprint in order, then rebuilds summaries once', async () => {
    vi.mocked(addModelsToLatestRun).mockImplementation(async (configId) => ({ configId, status: configId === 'b' ? 'skipped' : 'added' }));

    const res = await POST(request({ models: [APERTUS], configIds: ['a', 'b', 'c__d'], rebuildSummaries: true }));
    expect(res.status).toBe(202);
    await flush();

    expect(vi.mocked(addModelsToLatestRun).mock.calls.map(c => c[0])).toEqual(['a', 'b', 'c__d']);
    expect(vi.mocked(addModelsToLatestRun).mock.calls[0][1]).toEqual([APERTUS]);
    expect(vi.mocked(addModelsToLatestRun).mock.calls[0][3]).toEqual({ rejudge: false, retryFailed: false });
    expect(actionBackfillSummary).toHaveBeenCalledTimes(1);
  });

  it('passes rejudge and retryFailed through to each blueprint', async () => {
    vi.mocked(addModelsToLatestRun).mockImplementation(async (configId) => ({ configId, status: 'added' }));

    const res = await POST(request({ models: [APERTUS], configIds: ['a'], rejudge: true, retryFailed: true }));
    expect(res.status).toBe(202);
    await flush();

    expect(vi.mocked(addModelsToLatestRun).mock.calls[0][3]).toEqual({ rejudge: true, retryFailed: true });
  });

  it('keeps going after a blueprint throws, and rebuilds when asked even if nothing was added', async () => {
    vi.mocked(addModelsToLatestRun)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ configId: 'b', status: 'skipped' });

    const res = await POST(request({ models: [APERTUS], configIds: ['a', 'b'], rebuildSummaries: true }));
    expect(res.status).toBe(202);
    await flush();

    expect(addModelsToLatestRun).toHaveBeenCalledTimes(2);
    expect(actionBackfillSummary).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild unless asked', async () => {
    vi.mocked(addModelsToLatestRun).mockImplementation(async (configId) => ({ configId, status: 'added' }));

    const res = await POST(request({ models: [APERTUS], configIds: ['a'] }));
    expect(res.status).toBe(202);
    await flush();

    expect(actionBackfillSummary).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    vi.mocked(checkBackgroundAuth).mockReturnValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(request({ models: [APERTUS], configIds: ['a'] }));
    expect(res.status).toBe(401);
    expect(addModelsToLatestRun).not.toHaveBeenCalled();
  });

  it.each([
    { configIds: ['a'] },
    { models: [], configIds: ['a'] },
    { models: ['no-provider'], configIds: ['a'] },
    { models: [APERTUS] },
    { models: [APERTUS], configIds: ['../etc'] },
  ])('rejects a bad body: %j', async (body) => {
    const res = await POST(request(body));
    expect(res.status).toBe(400);
    expect(addModelsToLatestRun).not.toHaveBeenCalled();
  });
});
