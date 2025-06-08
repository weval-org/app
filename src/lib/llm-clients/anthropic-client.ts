import { LLMClient, LLMApiCallOptions, LLMApiCallResponse, LLMStreamApiCallOptions, StreamChunk } from './types';
import crypto from 'crypto';

const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_API_VERSION = '2023-06-01';

const llmCache = new Map<string, LLMApiCallResponse>();

function getCacheKey(input: LLMApiCallOptions): string {
    const hash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return `anthropic:${hash}`;
}

class AnthropicClient implements LLMClient {
    private apiKey: string;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.ANTHROPIC_API_KEY;
        if (!key) {
            throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
        }
        this.apiKey = key;
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
        };
    }

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResponse> {
        const { modelName, messages, systemPrompt, temperature = 0.3, maxTokens = 1500, cache = true } = options;
        const fetch = (await import('node-fetch')).default;

        if (cache) {
            const cacheKey = getCacheKey(options);
            if (llmCache.has(cacheKey)) {
                return llmCache.get(cacheKey)!;
            }
        }

        const body = JSON.stringify({
            model: modelName,
            system: systemPrompt,
            messages: messages?.filter(m => m.role !== 'system') || [],
            max_tokens: maxTokens,
            temperature,
            stream: false,
        });

        try {
            const response = await fetch(`${ANTHROPIC_API_BASE_URL}/messages`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
            });

            if (!response.ok) {
                const errorBody = await response.text();
                return { responseText: '', error: `Anthropic API Error: ${response.status} ${response.statusText} - ${errorBody}` };
            }

            const jsonResponse = await response.json() as any;
            const responseText = jsonResponse.content[0]?.text?.trim() ?? '';
            const result: LLMApiCallResponse = { responseText };

            if (cache) {
                const cacheKey = getCacheKey(options);
                llmCache.set(cacheKey, result);
            }

            return result;
        } catch (error: any) {
            return { responseText: '', error: `Network or other error calling Anthropic: ${error.message}` };
        }
    }

    public async *streamApiCall(options: LLMStreamApiCallOptions): AsyncGenerator<StreamChunk> {
        const { modelName, messages, systemPrompt, temperature = 0.3, maxTokens = 2000 } = options;
        const fetch = (await import('node-fetch')).default;

        const body = JSON.stringify({
            model: modelName,
            system: systemPrompt,
            messages: messages?.filter(m => m.role !== 'system') || [],
            max_tokens: maxTokens,
            temperature,
            stream: true,
        });

        try {
            const response = await fetch(`${ANTHROPIC_API_BASE_URL}/messages`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
            });

            if (!response.ok || !response.body) {
                const errorBody = await response.text();
                yield { type: 'error', error: `Anthropic stream Error: ${response.status} ${response.statusText} - ${errorBody}` };
                return;
            }

            for await (const chunk of response.body) {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'content_block_delta' && parsed.delta.type === 'text_delta') {
                                yield { type: 'content', content: parsed.delta.text };
                            }
                        } catch (e) {
                            // Ignore parsing errors for incomplete JSON
                        }
                    }
                }
            }
        } catch (error: any) {
            yield { type: 'error', error: `Network or other error during Anthropic stream: ${error.message}` };
        }
    }
}

export { AnthropicClient }; 