import { LLMApiCallOptions, LLMStreamApiCallOptions, StreamChunk, LLMApiCallResponse } from './types';
import crypto from 'crypto';

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

const llmCache = new Map<string, LLMApiCallResponse>();

function getCacheKey(input: LLMApiCallOptions): string {
    const hash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return `openai:${hash}`;
}

class OpenAIClient {
    private apiKey: string;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.OPENAI_API_KEY;
        if (!key) {
            throw new Error('OPENAI_API_KEY is not set in environment variables');
        }
        this.apiKey = key;
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        };
    }

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResponse> {
        const { modelName, messages: optionMessages, systemPrompt, temperature = 0.3, maxTokens = 1500, cache = true, prompt } = options;
        
        const fetch = (await import('node-fetch')).default;

        if (cache) {
            const cacheKey = getCacheKey(options);
            if (llmCache.has(cacheKey)) {
                return llmCache.get(cacheKey)!;
            }
        }

        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

        // Favor messages array if it exists
        if (optionMessages && optionMessages.length > 0) {
            messages.push(...optionMessages.filter(m => ['user', 'assistant', 'system'].includes(m.role)).map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content || '' })));
            if (systemPrompt && !messages.find(m => m.role === 'system')) {
                 messages.unshift({ role: 'system', content: systemPrompt });
            }
        } else {
            // Fallback to legacy prompt string behavior
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            messages.push({ role: 'user', content: prompt || '' });
        }

        const body = JSON.stringify({
            model: modelName,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: false,
        });

        try {
            const response = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
            });

            if (!response.ok) {
                const errorBody = await response.text();
                return { responseText: '', error: `OpenAI API Error: ${response.status} ${response.statusText} - ${errorBody}` };
            }

            const jsonResponse = await response.json() as any;
            const responseText = jsonResponse.choices[0]?.message?.content?.trim() ?? '';
            const result: LLMApiCallResponse = { responseText };

            if (cache) {
                const cacheKey = getCacheKey(options);
                llmCache.set(cacheKey, result);
            }

            return result;
        } catch (error: any) {
            return { responseText: '', error: `Network or other error calling OpenAI: ${error.message}` };
        }
    }

    public async *streamApiCall(options: LLMStreamApiCallOptions): AsyncGenerator<StreamChunk> {
        const { modelName, messages, systemPrompt, temperature = 0.3, maxTokens = 2000 } = options;

        const fetch = (await import('node-fetch')).default;

        const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = messages?.filter(m => ['user', 'assistant', 'system'].includes(m.role)).map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content || '' })) || [];
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
            const response = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
            });

            if (!response.ok || !response.body) {
                const errorBody = await response.text();
                yield { type: 'error', error: `OpenAI stream Error: ${response.status} ${response.statusText} - ${errorBody}` };
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
                            // Ignore parsing errors for incomplete JSON chunks
                        }
                    }
                }
            }
        } catch (error: any) {
            yield { type: 'error', error: `Network or other error during OpenAI stream: ${error.message}` };
        }
    }
}

export { OpenAIClient }; 