import {
    substituteEnvVars,
    substituteTemplates,
    validateServiceResponse,
    makeHttpRequest,
    TemplateData
} from '../external-service-utils';
import { ExternalServiceConfig } from '@/types/shared';

// Mock fetch globally
global.fetch = jest.fn();

describe('substituteEnvVars', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('should substitute environment variables', () => {
        process.env.TEST_VAR = 'test-value';
        process.env.ANOTHER_VAR = 'another-value';

        const result = substituteEnvVars('Bearer ${TEST_VAR} and ${ANOTHER_VAR}');
        expect(result).toBe('Bearer test-value and another-value');
    });

    it('should throw if environment variable is not defined', () => {
        expect(() => {
            substituteEnvVars('Bearer ${UNDEFINED_VAR}');
        }).toThrow('Environment variable UNDEFINED_VAR is not defined');
    });

    it('should handle string with no variables', () => {
        const result = substituteEnvVars('No variables here');
        expect(result).toBe('No variables here');
    });

    it('should handle empty string', () => {
        const result = substituteEnvVars('');
        expect(result).toBe('');
    });
});

describe('substituteTemplates', () => {
    const templateData: TemplateData = {
        response: 'Model response text',
        modelId: 'openai:gpt-4o-mini',
        promptId: 'test-prompt'
    };

    it('should substitute templates in string', () => {
        const result = substituteTemplates(
            'Response: {response}, Model: {modelId}, Prompt: {promptId}',
            templateData
        );
        expect(result).toBe('Response: Model response text, Model: openai:gpt-4o-mini, Prompt: test-prompt');
    });

    it('should substitute templates in nested object', () => {
        const obj = {
            text: '{response}',
            metadata: {
                model: '{modelId}',
                prompt: '{promptId}'
            }
        };

        const result = substituteTemplates(obj, templateData);
        expect(result).toEqual({
            text: 'Model response text',
            metadata: {
                model: 'openai:gpt-4o-mini',
                prompt: 'test-prompt'
            }
        });
    });

    it('should substitute templates in arrays', () => {
        const arr = ['{response}', { model: '{modelId}' }];
        const result = substituteTemplates(arr, templateData);
        expect(result).toEqual(['Model response text', { model: 'openai:gpt-4o-mini' }]);
    });

    it('should handle primitives', () => {
        expect(substituteTemplates(42, templateData)).toBe(42);
        expect(substituteTemplates(true, templateData)).toBe(true);
        expect(substituteTemplates(null, templateData)).toBe(null);
    });

    it('should not modify strings without templates', () => {
        const result = substituteTemplates('No templates here', templateData);
        expect(result).toBe('No templates here');
    });
});

describe('validateServiceResponse', () => {
    it('should validate correct response', () => {
        const response = { score: 0.95, explain: 'Test explanation' };
        const result = validateServiceResponse(response);
        expect(result).toEqual({ valid: true });
    });

    it('should accept response without explain', () => {
        const response = { score: 0.5 };
        const result = validateServiceResponse(response);
        expect(result).toEqual({ valid: true });
    });

    it('should accept response with error', () => {
        const response = { error: 'Service failed' };
        const result = validateServiceResponse(response);
        expect(result).toEqual({ valid: true });
    });

    it('should reject non-object response', () => {
        const result = validateServiceResponse('not an object');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be an object');
    });

    it('should reject null response', () => {
        const result = validateServiceResponse(null);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be an object');
    });

    it('should reject missing score', () => {
        const response = { explain: 'No score' };
        const result = validateServiceResponse(response);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('score must be a number');
    });

    it('should reject non-numeric score', () => {
        const response = { score: 'not a number' };
        const result = validateServiceResponse(response);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('score must be a number');
    });

    it('should reject score below 0', () => {
        const response = { score: -0.1 };
        const result = validateServiceResponse(response);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be between 0 and 1');
    });

    it('should reject score above 1', () => {
        const response = { score: 1.5 };
        const result = validateServiceResponse(response);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be between 0 and 1');
    });

    it('should accept score of 0', () => {
        const response = { score: 0 };
        const result = validateServiceResponse(response);
        expect(result).toEqual({ valid: true });
    });

    it('should accept score of 1', () => {
        const response = { score: 1 };
        const result = validateServiceResponse(response);
        expect(result).toEqual({ valid: true });
    });
});

describe('makeHttpRequest', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TEST_API_KEY = 'secret-key';
    });

    const config: ExternalServiceConfig = {
        url: 'https://example.com/api',
        method: 'POST',
        headers: {
            Authorization: 'Bearer ${TEST_API_KEY}'
        },
        timeout_ms: 5000
    };

    const requestBody = {
        response: 'test response',
        modelId: 'test-model',
        promptId: 'test-prompt'
    };

    it('should make successful HTTP request', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ score: 0.95, explain: 'Good response' })
        });

        const result = await makeHttpRequest(config, requestBody);

        expect(result).toEqual({ score: 0.95, explain: 'Good response' });
        expect(global.fetch).toHaveBeenCalledWith(
            'https://example.com/api',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer secret-key'
                }),
                body: JSON.stringify(requestBody)
            })
        );
    });

    it('should use default method POST', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ score: 0.5 })
        });

        const configWithoutMethod = { ...config, method: undefined };
        await makeHttpRequest(configWithoutMethod, requestBody);

        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        expect(fetchCall[1].method).toBe('POST');
    });

    it('should throw on HTTP error', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error'
        });

        await expect(makeHttpRequest(config, requestBody)).rejects.toThrow('HTTP 500');
    });

    it('should throw on invalid response format', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ invalid: 'response' })
        });

        await expect(makeHttpRequest(config, requestBody)).rejects.toThrow('Invalid service response');
    });

    it('should retry on network error', async () => {
        (global.fetch as jest.Mock)
            .mockRejectedValueOnce(new Error('fetch failed'))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ score: 0.8 })
            });

        const result = await makeHttpRequest(config, requestBody);

        expect(result).toEqual({ score: 0.8 });
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx error', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: false,
                status: 503,
                text: async () => 'Service Unavailable'
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ score: 0.9 })
            });

        const result = await makeHttpRequest(config, requestBody);

        expect(result).toEqual({ score: 0.9 });
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should respect max_retries', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('fetch failed'));

        const configWithRetries = { ...config, max_retries: 1 };

        await expect(makeHttpRequest(configWithRetries, requestBody)).rejects.toThrow('fetch failed');
        expect(global.fetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should not retry on 4xx errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => 'Not Found'
        });

        await expect(makeHttpRequest(config, requestBody)).rejects.toThrow('HTTP 404');
        expect(global.fetch).toHaveBeenCalledTimes(1); // No retry
    });

    it('should throw on undefined environment variable', async () => {
        delete process.env.TEST_API_KEY;

        await expect(makeHttpRequest(config, requestBody)).rejects.toThrow(
            'Failed to substitute env var in header'
        );
    });
});
