import { LLMApiCallOptions, LLMApiCallResult, StreamChunk } from './types';

const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_API_VERSION = '2023-06-01';

class AnthropicClient {
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

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
        // Extract modelName from modelId (format: "anthropic:claude-3-opus")
        const modelName = options.modelId.split(':')[1] || options.modelId;
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 1500, timeout = 30000 } = options;
        const fetch = (await import('node-fetch')).default;

        const body = JSON.stringify({
            model: modelName,
            system: systemPrompt,
            messages: messages?.filter(m => m.role !== 'system') || [],
            max_tokens: maxTokens,
            temperature,
            stream: false,
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${ANTHROPIC_API_BASE_URL}/messages`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                return { responseText: '', error: `Anthropic API Error: ${response.status} ${response.statusText} - ${errorBody}` };
            }

            const jsonResponse = await response.json() as any;
            const responseText = jsonResponse.content[0]?.text?.trim() ?? '';
            const result: LLMApiCallResult = { responseText };

            return result;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { responseText: '', error: `Anthropic API request timed out after ${timeout}ms` };
            }
            return { responseText: '', error: `Network or other error calling Anthropic: ${error.message}` };
        }
    }

    public async *streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk> {
        // Extract modelName from modelId (format: "anthropic:claude-3-opus")
        const modelName = options.modelId.split(':')[1] || options.modelId;
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 2000, timeout = 30000 } = options;
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${ANTHROPIC_API_BASE_URL}/messages`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

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
            if (error.name === 'AbortError') {
                yield { type: 'error', error: `Anthropic stream request timed out after ${timeout}ms` };
            } else {
                yield { type: 'error', error: `Network or other error during Anthropic stream: ${error.message}` };
            }
        }
    }
}

export { AnthropicClient }; 