import { vi } from 'vitest';

const mockFetch = vi.fn();
vi.mock('node-fetch', () => ({ default: mockFetch }));

import { PotluckClient } from '../potluck-client';

function jsonResponse(body: any, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Bad Request',
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

describe('PotluckClient', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        mockFetch.mockReset();
        process.env = { ...originalEnv };
        delete process.env.POTLUCK_API_KEY;
        delete process.env.POTLUCK_BASE_URL;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('throws when POTLUCK_API_KEY is not set', () => {
        expect(() => new PotluckClient()).toThrow('POTLUCK_API_KEY is not set');
    });

    it('sends an OpenAI-style request with the full slashed model name and the env key', async () => {
        process.env.POTLUCK_API_KEY = 'test-key';
        mockFetch.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '  Hola!  ' } }] }));

        const client = new PotluckClient();
        const result = await client.makeApiCall({
            modelId: 'potluck:aisingapore/Qwen-SEA-LION-v4-32B-IT',
            messages: [{ role: 'user', content: 'Hello' }],
            systemPrompt: 'Be brief.',
            temperature: 0,
            maxTokens: 50,
        });

        expect(result).toEqual({ responseText: 'Hola!' });
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe('https://router.stg.aipotluck.org/v1/chat/completions');
        expect(init.headers.Authorization).toBe('Bearer test-key');
        const body = JSON.parse(init.body);
        expect(body.model).toBe('aisingapore/Qwen-SEA-LION-v4-32B-IT');
        expect(body.messages).toEqual([
            { role: 'system', content: 'Be brief.' },
            { role: 'user', content: 'Hello' },
        ]);
        expect(body.temperature).toBe(0);
        expect(body.max_tokens).toBe(50);
    });

    it('uses POTLUCK_BASE_URL when set', async () => {
        process.env.POTLUCK_API_KEY = 'test-key';
        process.env.POTLUCK_BASE_URL = 'https://router.example.org/v1/';
        mockFetch.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));

        await new PotluckClient().makeApiCall({ modelId: 'potluck:m', messages: [{ role: 'user', content: 'hi' }] });

        expect(mockFetch.mock.calls[0][0]).toBe('https://router.example.org/v1/chat/completions');
    });

    it('returns the router error body on a non-2xx response', async () => {
        process.env.POTLUCK_API_KEY = 'test-key';
        mockFetch.mockResolvedValue(jsonResponse({ error: { message: 'Invalid model name' } }, 400));

        const result = await new PotluckClient().makeApiCall({ modelId: 'potluck:ALIA-40b-instruct', messages: [{ role: 'user', content: 'hi' }] });

        expect(result.responseText).toBe('');
        expect(result.error).toContain('Potluck API Error: 400');
        expect(result.error).toContain('Invalid model name');
    });

    it('reports an empty completion as an error rather than a blank answer', async () => {
        process.env.POTLUCK_API_KEY = 'test-key';
        mockFetch.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '' } }] }));

        const result = await new PotluckClient().makeApiCall({ modelId: 'potluck:m', messages: [{ role: 'user', content: 'hi' }] });

        expect(result.error).toContain('empty response');
    });
});
