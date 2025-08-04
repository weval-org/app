import { LLMApiCallOptions, LLMApiCallResult, StreamChunk } from './types';

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

class OpenAIClient {
    private apiKey: string;

    constructor(apiKey?: string) {
        console.log(`[OpenAIClient] Initializing OpenAI client`);
        console.log(`[OpenAIClient] API key provided as parameter: ${apiKey ? 'YES' : 'NO'}`);
        console.log(`[OpenAIClient] OPENAI_API_KEY env var present: ${process.env.OPENAI_API_KEY ? 'YES' : 'NO'}`);
        
        const key = apiKey || process.env.OPENAI_API_KEY;
        if (!key) {
            const error = 'OPENAI_API_KEY is not set in environment variables';
            console.error(`[OpenAIClient] ${error}`);
            throw new Error(error);
        }
        this.apiKey = key;
        console.log(`[OpenAIClient] Successfully initialized with API key (length: ${key.length})`);
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        };
    }

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
        console.log(`[OpenAIClient] makeApiCall called for modelId: ${options.modelId}`);
        
        // Extract modelName from modelId (format: "openai:gpt-4")
        const modelName = options.modelId.split(':')[1] || options.modelId;
        console.log(`[OpenAIClient] Extracted model name: ${modelName}`);
        
        const { messages: optionMessages, systemPrompt, temperature = 0.3, maxTokens = 1500, timeout = 30000 } = options;
        
        const fetch = (await import('node-fetch')).default;

        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

        // Favor messages array if it exists
        if (optionMessages && optionMessages.length > 0) {
            messages.push(...optionMessages.filter(m => ['user', 'assistant', 'system'].includes(m.role)).map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content || '' })));
            if (systemPrompt && !messages.find(m => m.role === 'system')) {
                 messages.unshift({ role: 'system', content: systemPrompt });
            }
        }

        const body = JSON.stringify({
            model: modelName,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: false,
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                return { responseText: '', error: `OpenAI API Error: ${response.status} ${response.statusText} - ${errorBody}` };
            }

            const jsonResponse = await response.json() as any;
            const responseText = jsonResponse.choices[0]?.message?.content?.trim() ?? '';
            const result: LLMApiCallResult = { responseText };

            return result;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { responseText: '', error: `OpenAI API request timed out after ${timeout}ms` };
            }
            return { responseText: '', error: `Network or other error calling OpenAI: ${error.message}` };
        }
    }

    public async *streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk> {
        // Extract modelName from modelId (format: "openai:gpt-4")  
        const modelName = options.modelId.split(':')[1] || options.modelId;
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 2000, timeout = 30000 } = options;

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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

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
            if (error.name === 'AbortError') {
                yield { type: 'error', error: `OpenAI stream request timed out after ${timeout}ms` };
            } else {
                yield { type: 'error', error: `Network or other error during OpenAI stream: ${error.message}` };
            }
        }
    }
}

export { OpenAIClient }; 