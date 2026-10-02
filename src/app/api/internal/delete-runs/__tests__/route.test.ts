/**
 * @vitest-environment node
 */
import { vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/storageService', () => ({ archiveAndDeleteRun: vi.fn(), listRunsForConfig: vi.fn() }));
vi.mock('@/cli/commands/backfill-summary', () => ({ actionBackfillSummary: vi.fn() }));
vi.mock('@/lib/background-function-auth', () => ({ checkBackgroundAuth: vi.fn(() => null) }));
vi.mock('@/utils/logger', () => ({
  getLogger: vi.fn(async () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { POST } from '../route';
import { archiveAndDeleteRun, listRunsForConfig } from '@/lib/storageService';
import { actionBackfillSummary } from '@/cli/commands/backfill-summary';
import { checkBackgroundAuth } from '@/lib/background-function-auth';

const LATEST = 'abc_2026-10-01T20-11-28-654Z_comparison.json';
const OLD_1 = 'abc_2026-10-01T19-47-15-945Z_comparison.json';
const OLD_2 = 'abc_2026-10-01T05-36-17-308Z_comparison.json';
const request = (body: unknown) =>
  new NextRequest('http://localhost:3172/api/internal/delete-runs', { method: 'POST', body: JSON.stringify(body) });
const flush = () => new Promise(r => setTimeout(r, 0));
const run = (fileName: string, configId = 'yka-set') => ({ configId, fileName });

describe('POST /api/internal/delete-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listRunsForConfig).mockResolvedValue(
      [LATEST, OLD_1, OLD_2].map(fileName => ({ runLabel: 'abc', timestamp: null, fileName })),
    );
    vi.mocked(archiveAndDeleteRun).mockImplementation(async (configId, fileName, archiveName, dryRun) => ({
      keys: [`live/blueprints/${configId}/${fileName}`, `live/blueprints/${configId}/x/core.json`],
      archivePrefix: dryRun ? null : `archive/deleted-runs/${archiveName}`,
    }));
  });

  it('defaults to a dry run that lists the runs and deletes nothing', async () => {
    const res = await POST(request({ runs: [run(OLD_1), run(OLD_2)] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.runs).toEqual([
      { configId: 'yka-set', fileName: OLD_1, objects: 2 },
      { configId: 'yka-set', fileName: OLD_2, objects: 2 },
    ]);
    expect(vi.mocked(archiveAndDeleteRun).mock.calls.every(c => c[3] === true)).toBe(true);
    expect(actionBackfillSummary).not.toHaveBeenCalled();
  });

  it('deletes each run in the background when dryRun is false, then rebuilds when asked', async () => {
    const res = await POST(request({ runs: [run(OLD_1), run(OLD_2)], dryRun: false, rebuildSummaries: true }));
    expect(res.status).toBe(202);
    await flush();

    expect(vi.mocked(archiveAndDeleteRun).mock.calls.map(c => [c[1], c[3]])).toEqual([[OLD_1, false], [OLD_2, false]]);
    const archiveNames = new Set(vi.mocked(archiveAndDeleteRun).mock.calls.map(c => c[2]));
    expect(archiveNames.size).toBe(1);
    expect(actionBackfillSummary).toHaveBeenCalledTimes(1);
  });

  it('keeps going after a run fails, and does not rebuild unless asked', async () => {
    vi.mocked(archiveAndDeleteRun).mockRejectedValueOnce(new Error('copy failed'));

    const res = await POST(request({ runs: [run(OLD_1), run(OLD_2)], dryRun: false }));
    expect(res.status).toBe(202);
    await flush();

    expect(archiveAndDeleteRun).toHaveBeenCalledTimes(2);
    expect(actionBackfillSummary).not.toHaveBeenCalled();
  });

  it("refuses to delete a blueprint's latest run, and touches nothing", async () => {
    const res = await POST(request({ runs: [run(OLD_1), run(LATEST)], dryRun: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.problems).toEqual([`yka-set/${LATEST}: is the latest run of yka-set; refusing to delete it`]);
    expect(archiveAndDeleteRun).not.toHaveBeenCalled();
  });

  it('refuses runs that do not exist or are listed twice', async () => {
    const missing = 'abc_2020-01-01T00-00-00Z_comparison.json';
    const res = await POST(request({ runs: [run(missing), run(OLD_1), run(OLD_1)], dryRun: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.problems).toEqual([`yka-set/${OLD_1}: listed twice`, `yka-set/${missing}: no such run`]);
    expect(archiveAndDeleteRun).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    vi.mocked(checkBackgroundAuth).mockReturnValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(request({ runs: [run(OLD_1)] }));
    expect(res.status).toBe(401);
    expect(listRunsForConfig).not.toHaveBeenCalled();
    expect(archiveAndDeleteRun).not.toHaveBeenCalled();
  });

  it.each([
    ['no runs', { runs: [] }],
    ['runs not a list', { runs: 'yka-set' }],
    ['a path in the file name', { runs: [run(`../${OLD_1}`)] }],
    ['not a run file', { runs: [run('summary.json')] }],
    ['a bad config ID', { runs: [run(OLD_1, '../live')] }],
  ])('rejects %s', async (_label, body) => {
    const res = await POST(request(body));
    expect(res.status).toBe(400);
    expect(archiveAndDeleteRun).not.toHaveBeenCalled();
  });
});
