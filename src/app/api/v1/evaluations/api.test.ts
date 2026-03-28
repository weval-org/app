import { POST as runHandler } from './run/route';
import { GET as statusHandler } from './status/[runId]/route';
import { GET as resultHandler } from './result/[runId]/route';
import { NextRequest } from 'next/server';
import { getJsonFile } from '@/lib/storageService';

jest.mock('@/lib/storageService', () => ({
    getJsonFile: jest.fn(),
}));

global.fetch = jest.fn();

const MOCK_API_KEY = 'test-api-key';
process.env.PUBLIC_API_KEY = MOCK_API_KEY;
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

const mockBlueprint = `
title: "API Test Blueprint"
models: ["openai:gpt-4o-mini"]
prompts:
  - prompt: "Hello, world!"
`;

describe('Public Evaluation API v1', () => {
    beforeEach(() => {
        (fetch as jest.Mock).mockClear();
        (getJsonFile as jest.Mock).mockClear();
        process.env.DISABLE_PUBLIC_API_AUTH = 'false';
    });

    describe('POST /api/v1/evaluations/run', () => {
        it('should reject requests with no API key', async () => {
            const req = new NextRequest('http://localhost/api/v1/evaluations/run', {
                method: 'POST',
                body: mockBlueprint,
            });
            const res = await runHandler(req);
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error).toContain('Missing or invalid Authorization header');
        });

        it('should reject requests with an invalid API key', async () => {
            const req = new NextRequest('http://localhost/api/v1/evaluations/run', {
                method: 'POST',
                headers: { Authorization: 'Bearer wrong-key' },
                body: mockBlueprint,
            });
            const res = await runHandler(req);
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error).toContain('Invalid API key');
        });

        it('should accept a valid request and trigger the background function', async () => {
            process.env.DISABLE_PUBLIC_API_AUTH = 'true';
            const req = new NextRequest('http://localhost/api/v1/evaluations/run', {
                method: 'POST',
                headers: { Authorization: `Bearer ${MOCK_API_KEY}` },
                body: mockBlueprint,
            });

            (fetch as jest.Mock).mockResolvedValue({ status: 200 });

            const res = await runHandler(req);
            expect(res.status).toBe(200);
            const body = await res.json();

            expect(body.runId).toBeDefined();
            expect(body.statusUrl).toContain(`/api/v1/evaluations/status/${body.runId}`);
            
            expect(fetch).toHaveBeenCalledTimes(1);
            const fetchCall = (fetch as jest.Mock).mock.calls[0];
            const fetchUrl = fetchCall[0];
            const fetchOptions = fetchCall[1];

            expect(fetchUrl).toContain('/api/internal/execute-api-evaluation-background');
            const invokedBody = JSON.parse(fetchOptions.body);
            expect(invokedBody.runId).toEqual(body.runId);
            expect(invokedBody.config.tags).toContain('_public_api');
        });
    });

    describe('GET /api/v1/evaluations/status/[runId]', () => {
        it('should return pending if status file does not exist', async () => {
            (getJsonFile as jest.Mock).mockResolvedValue(null);
            const req = new NextRequest('http://localhost/api/v1/evaluations/status/test-run-id');
            const res = await statusHandler(req, { params: { runId: 'test-run-id' } });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.status).toBe('pending');
        });

        it('should return the status from the file if it exists', async () => {
            const mockStatus = { status: 'running', message: 'In progress' };
            (getJsonFile as jest.Mock).mockResolvedValue(mockStatus);
            const req = new NextRequest('http://localhost/api/v1/evaluations/status/test-run-id');
            const res = await statusHandler(req, { params: { runId: 'test-run-id' } });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body).toEqual(mockStatus);
        });
    });

    describe('GET /api/v1/evaluations/result/[runId]', () => {
        it('should return 202 if status is not completed', async () => {
            (getJsonFile as jest.Mock).mockResolvedValue({ status: 'running' });
            const req = new NextRequest('http://localhost/api/v1/evaluations/result/test-run-id');
            const res = await resultHandler(req, { params: { runId: 'test-run-id' } });
            expect(res.status).toBe(202);
            const body = await res.json();
            expect(body.error).toBe('Result not ready.');
        });

        it('should return the result if status is completed', async () => {
            const mockStatus = {
                status: 'completed',
                payload: {
                    output: 'api-runs/test-run-id/results/live/blueprints/api-run-abc/hash_ts_comparison.json',
                    resultUrl: 'http://localhost/analysis/api-run-abc/hash/ts',
                },
            };
            const mockResult = { title: 'Test Result' };
            (getJsonFile as jest.Mock)
                .mockResolvedValueOnce(mockStatus) // For status check
                .mockResolvedValueOnce(mockResult); // For core.json result

            const req = new NextRequest('http://localhost/api/v1/evaluations/result/test-run-id');
            const res = await resultHandler(req, { params: { runId: 'test-run-id' } });
            
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.result).toEqual(mockResult);
            expect(body.resultUrl).toEqual(mockStatus.payload.resultUrl);

            // Check that it tried to get the core.json file
            const getJsonFileCalls = (getJsonFile as jest.Mock).mock.calls;
            expect(getJsonFileCalls[1][0]).toContain('core.json');
        });
    });
});
