import { LLMApiCallOptions, LLMApiCallResult, StreamChunk } from './types';

// Current AI's OpenAI-compatible model router. The key and (optionally) the base URL come
// from the environment so they never appear in a blueprint or a saved result.
const DEFAULT_POTLUCK_API_BASE_URL = 'https://router.stg.aipotluck.org/v1';

class PotluckClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.POTLUCK_API_KEY;
        if (!key) {
            throw new Error('POTLUCK_API_KEY is not set in environment variables');
        }
        this.apiKey = key;
        this.baseUrl = (process.env.POTLUCK_BASE_URL || DEFAULT_POTLUCK_API_BASE_URL).replace(/\/+$/, '');
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        };
    }

    // Some router-hosted models (Apertus v1.5) have a share of requests rejected as
    // "invalid" when they carry a system message; the same content sent as one user
    // message is accepted. This folds system content into the first user turn.
    private foldSystemIntoUser(messages: any[]): any[] {
        const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const rest = messages.filter(m => m.role !== 'system');
        if (!system) return rest;
        const firstUser = rest.findIndex(m => m.role === 'user');
        if (firstUser === -1) return [{ role: 'user', content: system }, ...rest];
        return rest.map((m, i) => i === firstUser ? { ...m, content: `${system}\n\n${m.content}` } : m);
    }

    private isRejectedAsInvalid(status: number, body: string): boolean {
        return status === 400 && /rejected as invalid/i.test(body);
    }

    // Model names can contain slashes (e.g. "potluck:aisingapore/Qwen-SEA-LION-v4-32B-IT"),
    // so take everything after the first colon.
    private getModelName(modelId: string): string {
        const idx = modelId.indexOf(':');
        return idx === -1 ? modelId : modelId.substring(idx + 1);
    }

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
        const modelName = this.getModelName(options.modelId);
        const {
            messages,
            systemPrompt,
            temperature = 0.3,
            maxTokens = 1500,
            timeout = 60000,
            topP,
            stop,
        } = options;
        const fetch = (await import('node-fetch')).default;

        const apiMessages = [...(messages || [])];
        if (systemPrompt) {
            apiMessages.unshift({ role: 'system', content: systemPrompt });
        }

        const bodyObj: any = {
            model: modelName,
            messages: apiMessages,
            max_tokens: maxTokens,
            temperature,
            stream: false,
        };
        if (topP !== undefined) bodyObj.top_p = topP;
        if (stop !== undefined) bodyObj.stop = stop;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            let response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(bodyObj),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorBody = await response.text();
                const hasSystem = apiMessages.some(m => m.role === 'system');
                if (!(hasSystem && this.isRejectedAsInvalid(response.status, errorBody))) {
                    clearTimeout(timeoutId);
                    return { responseText: '', error: `Potluck API Error: ${response.status} ${response.statusText} - ${errorBody}` };
                }
                console.warn(`[PotluckClient] ${modelName} rejected a request with a system message; retrying with it folded into the user message.`);
                response = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ ...bodyObj, messages: this.foldSystemIntoUser(apiMessages) }),
                    signal: controller.signal,
                });
                if (!response.ok) {
                    clearTimeout(timeoutId);
                    const retryBody = await response.text();
                    return { responseText: '', error: `Potluck API Error: ${response.status} ${response.statusText} - ${retryBody}` };
                }
            }

            clearTimeout(timeoutId);

            const jsonResponse = await response.json() as any;
            const responseText = jsonResponse.choices?.[0]?.message?.content?.trim() ?? '';
            if (!responseText) {
                return { responseText: '', error: `Potluck API returned an empty response for model ${modelName}` };
            }
            return { responseText };
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { responseText: '', error: `Potluck API request timed out after ${timeout}ms` };
            }
            return { responseText: '', error: `Network or other error calling Potluck API: ${error.message}` };
        }
    }

    public async *streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk> {
        const modelName = this.getModelName(options.modelId);
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 2000, timeout = 60000 } = options;
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

            let response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            if (!response.ok && apiMessages.some(m => m.role === 'system')) {
                const errorBody = await response.text();
                if (!this.isRejectedAsInvalid(response.status, errorBody)) {
                    clearTimeout(timeoutId);
                    yield { type: 'error', error: `Potluck stream Error: ${response.status} ${response.statusText} - ${errorBody}` };
                    return;
                }
                console.warn(`[PotluckClient] ${modelName} rejected a streamed request with a system message; retrying with it folded into the user message.`);
                response = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ ...JSON.parse(body), messages: this.foldSystemIntoUser(apiMessages) }),
                    signal: controller.signal,
                });
            }

            clearTimeout(timeoutId);

            if (!response.ok || !response.body) {
                const errorBody = await response.text();
                yield { type: 'error', error: `Potluck stream Error: ${response.status} ${response.statusText} - ${errorBody}` };
                return;
            }

            let buffer = '';
            for await (const chunk of response.body) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.substring(6);
                    if (data.trim() === '[DONE]') {
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            yield { type: 'content', content };
                        }
                    } catch (e) {
                        // Ignore parsing errors
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                yield { type: 'error', error: `Potluck stream request timed out after ${timeout}ms` };
            } else {
                yield { type: 'error', error: `Network or other error during Potluck stream: ${error.message}` };
            }
        }
    }
}

export { PotluckClient };
