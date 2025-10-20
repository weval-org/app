import { LLMApiCallOptions, LLMApiCallResult, StreamChunk } from './types';

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

// Capability hints for models known to require special parameter handling.
// Keys are treated as prefixes; the first matching prefix applies.
// We intentionally keep this small and conservative; dynamic adaptation handles everything else.
type ModelCapabilityOverrides = { useMaxCompletionTokens?: boolean; omitTemperature?: boolean };
const KNOWN_MODEL_HINTS: Record<string, ModelCapabilityOverrides> = {
    // OpenAI o-series reasoning models: typically require max_completion_tokens and omit temperature
    'o1': { useMaxCompletionTokens: true, omitTemperature: true },
    'o1-mini': { useMaxCompletionTokens: true, omitTemperature: true },
    'o1-preview': { useMaxCompletionTokens: true, omitTemperature: true },
    'o3': { useMaxCompletionTokens: true, omitTemperature: true },
    'o3-mini': { useMaxCompletionTokens: true, omitTemperature: true },
    // gpt-5 base family often enforces similar constraints (observed in logs)
    'gpt-5': { useMaxCompletionTokens: true, omitTemperature: true },
};

// Cache per process: once we learn a model's constraints from errors, remember them
const modelCapabilityCache: Record<string, ModelCapabilityOverrides> = {};

function getCapabilityOverridesForModel(modelName: string): ModelCapabilityOverrides | undefined {
    if (modelCapabilityCache[modelName]) {
        return modelCapabilityCache[modelName];
    }
    // Find a matching known prefix (longest match wins)
    let bestMatch: string | undefined;
    for (const prefix of Object.keys(KNOWN_MODEL_HINTS)) {
        if (modelName === prefix || modelName.startsWith(prefix + '-') || modelName.startsWith(prefix + ':') || modelName.startsWith(prefix)) {
            if (!bestMatch || prefix.length > bestMatch.length) bestMatch = prefix;
        }
    }
    return bestMatch ? KNOWN_MODEL_HINTS[bestMatch] : undefined;
}

function mergeOverrides(base: ModelCapabilityOverrides | undefined, add: ModelCapabilityOverrides | undefined): ModelCapabilityOverrides | undefined {
    if (!base && !add) return undefined;
    return {
        useMaxCompletionTokens: Boolean(base?.useMaxCompletionTokens || add?.useMaxCompletionTokens),
        omitTemperature: Boolean(base?.omitTemperature || add?.omitTemperature),
    };
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

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
        // Extract modelName from modelId (format: "openai:gpt-4")
        const modelName = options.modelId.split(':')[1] || options.modelId;
        
        const { messages: optionMessages, systemPrompt, temperature = 0.3, maxTokens = 1500, timeout = 30000, tools, toolChoice, toolMode, reasoningEffort } = options;
        
        const fetch = (await import('node-fetch')).default;

        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

        // Favor messages array if it exists
        if (optionMessages && optionMessages.length > 0) {
            messages.push(...optionMessages.filter(m => ['user', 'assistant', 'system'].includes(m.role)).map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content || '' })));
            if (systemPrompt && !messages.find(m => m.role === 'system')) {
                 messages.unshift({ role: 'system', content: systemPrompt });
            }
        }

        // Get any known capability hints for this model, and merge with runtime overrides
        const hinted = getCapabilityOverridesForModel(modelName);

        // Build request body and adapt dynamically on 400 errors (e.g., max_tokens unsupported, temperature unsupported)
        const buildBody = (overrides?: { useMaxCompletionTokens?: boolean; omitTemperature?: boolean }) => {
            const effective = mergeOverrides(hinted, overrides);
            const payload: any = {
                model: modelName,
                messages,
                stream: false,
            };
            // Native tool-calling support (opt-in via toolMode 'native' or 'auto')
            if (tools && (toolMode === 'native' || toolMode === 'auto')) {
                payload.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema || {} } }));
                if (toolChoice) payload.tool_choice = toolChoice as any;
            }
            if (!effective?.omitTemperature && typeof temperature === 'number') {
                payload.temperature = temperature;
            }
            if (typeof maxTokens === 'number') {
                if (effective?.useMaxCompletionTokens) {
                    payload.max_completion_tokens = maxTokens;
                } else {
                    payload.max_tokens = maxTokens;
                }
            }
            // Add reasoning_effort for reasoning models (GPT-5, o1, o3, etc.)
            if (reasoningEffort) {
                payload.reasoning_effort = reasoningEffort;
            }
            return JSON.stringify(payload);
        };

        try {
            const doRequest = async (bodyStr: string) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                try {
                    const resp = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
                        method: 'POST',
                        headers: this.getHeaders(),
                        body: bodyStr,
                        signal: controller.signal,
                    });
                    return resp;
                } finally {
                    clearTimeout(timeoutId);
                }
            };

            // First attempt with standard parameters
            let response = await doRequest(buildBody());

            // If bad request, inspect error and try one adaptive retry
            if (!response.ok && response.status === 400) {
                const errorBody = await response.text();
                let parsed: any;
                try { parsed = JSON.parse(errorBody); } catch (_) {}
                const message: string = parsed?.error?.message || errorBody || '';
                const param: string | undefined = parsed?.error?.param;

                const maxTokensUnsupported = param === 'max_tokens' || /max_tokens[^]*not supported|use 'max_completion_tokens'/i.test(message);
                const temperatureUnsupported = param === 'temperature' || /temperature[^]*not supported|does not support|Only the default \(1\) value is supported/i.test(message);

                if (maxTokensUnsupported || temperatureUnsupported) {
                    const adaptive: ModelCapabilityOverrides = {
                        useMaxCompletionTokens: maxTokensUnsupported,
                        omitTemperature: temperatureUnsupported,
                    };
                    // Cache what we learned for this model
                    modelCapabilityCache[modelName] = mergeOverrides(modelCapabilityCache[modelName], adaptive) || adaptive;
                    response = await doRequest(buildBody(adaptive));
                } else {
                    return { responseText: '', error: `OpenAI API Error: ${response.status} ${response.statusText} - ${errorBody}` };
                }
            }

            if (!response.ok) {
                const errorBody = await response.text();
                return { responseText: '', error: `OpenAI API Error: ${response.status} ${response.statusText} - ${errorBody}` };
            }

            const jsonResponse = await response.json() as any;
            // Synthesize TOOL_CALL lines from native tool_calls if present
            let toolPrefix = '';
            const toolCalls = jsonResponse.choices?.[0]?.message?.tool_calls;
            if (Array.isArray(toolCalls)) {
                for (const tc of toolCalls) {
                    const fn = tc?.function;
                    if (fn?.name) {
                        let argsObj: any = undefined;
                        try { argsObj = fn.arguments ? JSON.parse(fn.arguments) : undefined; } catch { argsObj = fn.arguments; }
                        toolPrefix += `TOOL_CALL ${JSON.stringify({ name: fn.name, arguments: argsObj })}\n`;
                    }
                }
            }
            const responseText = (toolPrefix + (jsonResponse.choices[0]?.message?.content?.trim() ?? '')).trim();
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
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 2000, timeout = 30000, reasoningEffort } = options;

        const fetch = (await import('node-fetch')).default;

        const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = messages?.filter(m => ['user', 'assistant', 'system'].includes(m.role)).map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content || '' })) || [];
        if (systemPrompt) {
            apiMessages.unshift({ role: 'system', content: systemPrompt });
        }

        const hinted = getCapabilityOverridesForModel(modelName);
        const buildStreamBody = (overrides?: { useMaxCompletionTokens?: boolean; omitTemperature?: boolean }) => {
            const effective = mergeOverrides(hinted, overrides);
            const payload: any = {
                model: modelName,
                messages: apiMessages,
                stream: true,
            };
            if (!effective?.omitTemperature && typeof temperature === 'number') {
                payload.temperature = temperature;
            }
            if (typeof maxTokens === 'number') {
                if (effective?.useMaxCompletionTokens) {
                    payload.max_completion_tokens = maxTokens;
                } else {
                    payload.max_tokens = maxTokens;
                }
            }
            // Add reasoning_effort for reasoning models (GPT-5, o1, o3, etc.)
            if (reasoningEffort) {
                payload.reasoning_effort = reasoningEffort;
            }
            return JSON.stringify(payload);
        };

        try {
            const doRequest = async (bodyStr: string) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                try {
                    const resp = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
                        method: 'POST',
                        headers: this.getHeaders(),
                        body: bodyStr,
                        signal: controller.signal,
                    });
                    return resp;
                } finally {
                    clearTimeout(timeoutId);
                }
            };

            // First attempt
            let response = await doRequest(buildStreamBody());
            if (!response.ok) {
                const errorBody = await response.text();
                if (response.status === 400) {
                    let parsed: any;
                    try { parsed = JSON.parse(errorBody); } catch (_) {}
                    const message: string = parsed?.error?.message || errorBody || '';
                    const param: string | undefined = parsed?.error?.param;
                    const maxTokensUnsupported = param === 'max_tokens' || /max_tokens[^]*not supported|use 'max_completion_tokens'/i.test(message);
                    const temperatureUnsupported = param === 'temperature' || /temperature[^]*not supported|does not support|Only the default \(1\) value is supported/i.test(message);
                    if (maxTokensUnsupported || temperatureUnsupported) {
                        const adaptive: ModelCapabilityOverrides = {
                            useMaxCompletionTokens: maxTokensUnsupported,
                            omitTemperature: temperatureUnsupported,
                        };
                        modelCapabilityCache[modelName] = mergeOverrides(modelCapabilityCache[modelName], adaptive) || adaptive;
                        response = await doRequest(buildStreamBody(adaptive));
                    } else {
                        yield { type: 'error', error: `OpenAI stream Error: ${response.status} ${response.statusText} - ${errorBody}` };
                        return;
                    }
                } else {
                    yield { type: 'error', error: `OpenAI stream Error: ${response.status} ${response.statusText} - ${errorBody}` };
                    return;
                }
            }

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