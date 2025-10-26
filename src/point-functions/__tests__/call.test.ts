import { call } from '../call';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig } from '@/cli/types/cli_types';

// Mock fetch globally
global.fetch = jest.fn();

// Mock CLI config
jest.mock('@/cli/config', () => ({
    getConfig: jest.fn(() => ({
        logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        }
    }))
}));

// Mock cache
jest.mock('@/lib/cache-service', () => ({
    getCache: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(true)
    })),
    generateCacheKey: jest.fn((payload) => JSON.stringify(payload))
}));

const mockContext: PointFunctionContext = {
    config: {
        models: ['test-model'],
        prompts: [],
        externalServices: {
            'test-service': {
                url: 'https://example.com/evaluate',
                headers: {
                    'Authorization': 'Bearer ${TEST_API_KEY}'
                },
                timeout_ms: 5000
            },
            'another-service': {
                url: 'https://another.example.com/check',
                method: 'POST'
            }
        }
    } as ComparisonConfig,
    prompt: { id: 'test-prompt' } as PromptConfig,
    modelId: 'test-model',
};

describe('call point function', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TEST_API_KEY = 'secret-key-123';
    });

    describe('argument validation', () => {
        it('should return error if args is not an object', async () => {
            const result = await call('test response', 'invalid args' as any, mockContext);

            expect(result).toMatchObject({
                error: expect.stringContaining('must be an object')
            });
        });

        it('should return error if args is null', async () => {
            const result = await call('test response', null as any, mockContext);

            expect(result).toMatchObject({
                error: expect.stringContaining('must be an object')
            });
        });

        it('should return error if neither service nor url is provided', async () => {
            const result = await call('test response', {}, mockContext);

            expect(result).toMatchObject({
                error: expect.stringContaining('Must provide either')
            });
        });

        it('should return error if service not found', async () => {
            const result = await call(
                'test response',
                { service: 'nonexistent-service' },
                mockContext
            );

            expect(result).toMatchObject({
                error: expect.stringContaining('not found in config')
            });
            if (typeof result === 'object' && 'error' in result) {
                expect(result.error).toContain('test-service');
                expect(result.error).toContain('another-service');
            }
        });
    });

    describe('named service calls', () => {
        it('should call named service and return score', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0.95, explain: 'Excellent response' })
            });

            const result = await call(
                'Paris is the capital of France',
                { service: 'test-service', claim: 'Paris is capital' },
                mockContext
            );

            expect(result).toEqual({
                score: 0.95,
                explain: 'Excellent response'
            });

            expect(global.fetch).toHaveBeenCalledWith(
                'https://example.com/evaluate',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer secret-key-123'
                    }),
                    body: expect.stringContaining('Paris is capital')
                })
            );
        });

        it('should include standard fields in request body', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0.8 })
            });

            await call(
                'test response',
                { service: 'test-service', customParam: 'value' },
                mockContext
            );

            const requestBody = JSON.parse(
                (global.fetch as jest.Mock).mock.calls[0][1].body
            );

            expect(requestBody).toMatchObject({
                response: 'test response',
                modelId: 'test-model',
                promptId: 'test-prompt',
                customParam: 'value'
            });
        });

        it('should substitute templates in user parameters', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 1.0 })
            });

            await call(
                'Model response text',
                {
                    service: 'test-service',
                    responseText: '{response}',
                    model: '{modelId}',
                    prompt: '{promptId}'
                },
                mockContext
            );

            const requestBody = JSON.parse(
                (global.fetch as jest.Mock).mock.calls[0][1].body
            );

            expect(requestBody.responseText).toBe('Model response text');
            expect(requestBody.model).toBe('test-model');
            expect(requestBody.prompt).toBe('test-prompt');
        });

        it('should filter out config keys from user params', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0.7 })
            });

            await call(
                'test',
                {
                    service: 'test-service',
                    url: 'should-be-ignored',
                    method: 'should-be-ignored',
                    headers: 'should-be-ignored',
                    timeout_ms: 'should-be-ignored',
                    customParam: 'should-be-included'
                },
                mockContext
            );

            const requestBody = JSON.parse(
                (global.fetch as jest.Mock).mock.calls[0][1].body
            );

            expect(requestBody).not.toHaveProperty('url');
            expect(requestBody).not.toHaveProperty('method');
            expect(requestBody).not.toHaveProperty('headers');
            expect(requestBody).not.toHaveProperty('timeout_ms');
            expect(requestBody.customParam).toBe('should-be-included');
        });
    });

    describe('inline service calls', () => {
        it('should support inline URL', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0.85 })
            });

            const result = await call(
                'test response',
                {
                    url: 'https://custom.example.com/validate',
                    customParam: 'value'
                },
                mockContext
            );

            expect(result).toMatchObject({ score: 0.85 });
            expect(global.fetch).toHaveBeenCalledWith(
                'https://custom.example.com/validate',
                expect.anything()
            );
        });

        it('should use inline headers', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0.9 })
            });

            process.env.CUSTOM_TOKEN = 'inline-token';

            await call(
                'test',
                {
                    url: 'https://custom.example.com/check',
                    headers: {
                        'X-Custom-Header': 'Bearer ${CUSTOM_TOKEN}'
                    }
                },
                mockContext
            );

            expect(global.fetch).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-Custom-Header': 'Bearer inline-token'
                    })
                })
            );
        });

        it('should use inline timeout', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0.5 })
            });

            await call(
                'test',
                {
                    url: 'https://example.com/test',
                    timeout_ms: 60000
                },
                mockContext
            );

            // Verify fetch was called (timeout is internal to makeHttpRequest)
            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should handle service error response', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ error: 'Service temporarily unavailable' })
            });

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            expect(result).toMatchObject({
                error: expect.stringContaining('Service temporarily unavailable')
            });
        });

        it('should handle HTTP error', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error'
            });

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            expect(result).toMatchObject({
                error: expect.stringContaining('500')
            });
        });

        it('should handle network error', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(
                new Error('Network connection failed')
            );

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            expect(result).toMatchObject({
                error: expect.stringContaining('Network connection failed')
            });
        });

        it('should handle invalid response format', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ invalid: 'response' })
            });

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            expect(result).toMatchObject({
                error: expect.stringContaining('Invalid service response')
            });
        });

        it('should handle missing environment variable', async () => {
            delete process.env.TEST_API_KEY;

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            expect(result).toMatchObject({
                error: expect.stringContaining('Environment variable')
            });
        });
    });

    describe('caching', () => {
        it('should check cache before making request', async () => {
            const mockCache = {
                get: jest.fn().mockResolvedValue({ score: 0.99, explain: 'Cached result' }),
                set: jest.fn()
            };

            const { getCache } = require('@/lib/cache-service');
            getCache.mockReturnValue(mockCache);

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            if (typeof result === 'object' && 'score' in result) {
                expect(result.score).toBe(0.99);
                expect(result.explain).toContain('Cached');
            }
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should cache successful results', async () => {
            const mockCache = {
                get: jest.fn().mockResolvedValue(null),
                set: jest.fn()
            };

            const { getCache } = require('@/lib/cache-service');
            getCache.mockReturnValue(mockCache);

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0.75, explain: 'Fresh result' })
            });

            await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            expect(mockCache.set).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ score: 0.75 }),
                expect.any(Number)
            );
        });
    });

    describe('score variations', () => {
        it('should handle score of 0', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0 })
            });

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            if (typeof result === 'object' && 'score' in result) {
                expect(result.score).toBe(0);
            }
        });

        it('should handle score of 1', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 1 })
            });

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            if (typeof result === 'object' && 'score' in result) {
                expect(result.score).toBe(1);
            }
        });

        it('should handle response without explain', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ score: 0.5 })
            });

            const result = await call(
                'test',
                { service: 'test-service' },
                mockContext
            );

            if (typeof result === 'object' && 'score' in result) {
                expect(result.score).toBe(0.5);
                expect(result.explain).toBeUndefined();
            }
        });
    });
});
