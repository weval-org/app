import { LLMApiCallOptions, LLMApiCallResult, StreamChunk } from './types';
import crypto from 'crypto';

const TOGETHER_API_BASE_URL = 'https://api.together.xyz/v1';

class TogetherClient {
    private apiKey: string;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.TOGETHER_API_KEY;
        if (!key) {
            throw new Error('TOGETHER_API_KEY is not set in environment variables');
        }
        this.apiKey = key;
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        };
    }

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
        // Extract modelName from modelId (format: "together:meta-llama/Meta-Llama-3-70B-Instruct-Turbo")
        const modelName = options.modelId.split(':')[1] || options.modelId;
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 1500, timeout = 120000 } = options;
        const fetch = (await import('node-fetch')).default;

        const apiMessages = [...(messages || [])];
        if (systemPrompt) {
            apiMessages.unshift({ role: 'system', content: systemPrompt });
        }

        const body = JSON.stringify({
            model: modelName,
            messages: apiMessages,
            max_tokens: maxTokens,
            temperature,
            stream: false,
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${TOGETHER_API_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                return { responseText: '', error: `Together API Error: ${response.status} ${response.statusText} - ${errorBody}` };
            }

            const jsonResponse = await response.json() as any;
            const responseText = jsonResponse.choices[0]?.message?.content?.trim() ?? '';
            const result: LLMApiCallResult = { responseText };

            return result;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { responseText: '', error: `Together API request timed out after ${timeout}ms` };
            }
            return { responseText: '', error: `Network or other error calling Together API: ${error.message}` };
        }
    }

    public async *streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk> {
        // Extract modelName from modelId (format: "together:meta-llama/Meta-Llama-3-70B-Instruct-Turbo")
        const modelName = options.modelId.split(':')[1] || options.modelId;
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 2000, timeout = 120000 } = options;
        const fetch = (await import('node-fetch')).default;

        const apiMessages = [...(messages || [])];
        if (systemPrompt) {
            apiMessages.unshift({ role: 'system', content: systemPrompt });
        }

        const body = JSON.stringify({
            model: modelName,
            messages: apiMessages,
            max_tokens: maxTokens,
            temperature,
            stream: true,
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${TOGETHER_API_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok || !response.body) {
                const errorBody = await response.text();
                yield { type: 'error', error: `Together stream Error: ${response.status} ${response.statusText} - ${errorBody}` };
                return;
            }
            
            for await (const chunk of response.body) {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data.trim() === '[DONE]') {
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content;
                            if (content) {
                                yield { type: 'content', content };
                            }
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                yield { type: 'error', error: `Together stream request timed out after ${timeout}ms` };
            } else {
                yield { type: 'error', error: `Network or other error during Together stream: ${error.message}` };
            }
        }
    }
}

export { TogetherClient }; 