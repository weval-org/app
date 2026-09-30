/**
 * @vitest-environment node
 */
import { vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/cli/commands/generate-model-card', () => ({ actionGenerateModelCard: vi.fn() }));
vi.mock('@/lib/background-function-auth', () => ({ checkBackgroundAuth: vi.fn(() => null) }));
vi.mock('@/utils/logger', () => ({
  getLogger: vi.fn(async () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { POST } from '../route';
import { actionGenerateModelCard } from '@/cli/commands/generate-model-card';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { getConfig } from '@/cli/config';

function request(body: unknown) {
  return new NextRequest('http://localhost:3172/api/internal/generate-model-card', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/internal/generate-model-card', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates the card for the pattern with the CLI configured', async () => {
    vi.mocked(actionGenerateModelCard).mockImplementation(async () => {
      getConfig().logger.info('generating'); // the real command reads getConfig()
    });

    const res = await POST(request({ pattern: 'apertus-v1.5-70b' }));

    expect(res.status).toBe(200);
    expect(actionGenerateModelCard).toHaveBeenCalledWith('apertus-v1.5-70b', {});
  });

  it('rejects unauthenticated requests', async () => {
    vi.mocked(checkBackgroundAuth).mockReturnValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const res = await POST(request({ pattern: 'apertus-v1.5-70b' }));

    expect(res.status).toBe(401);
    expect(actionGenerateModelCard).not.toHaveBeenCalled();
  });

  it.each([{}, { pattern: '' }, { pattern: 'a b' }, { pattern: '../x' }, '{not json'])('rejects a bad body: %j', async (body) => {
    const res = await POST(request(body));

    expect(res.status).toBe(400);
    expect(actionGenerateModelCard).not.toHaveBeenCalled();
  });
});
