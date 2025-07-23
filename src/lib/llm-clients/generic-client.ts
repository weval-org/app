import { LLMApiCallOptions, LLMApiCallResult, StreamChunk, CustomModelDefinition } from './types';

class GenericHttpClient {
    private config: CustomModelDefinition;

    constructor(config: CustomModelDefinition) {
        this.config = config;
    }

    private getHeaders() {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...this.config.headers,
        };
        return headers;
    }

    private buildRequestBody(options: LLMApiCallOptions, streaming = false): any {
        const { 
            messages: optionMessages, 
            systemPrompt, 
            temperature = 0.3, 
            maxTokens = 1500,
            topP,
            topK,
            presencePenalty,
            frequencyPenalty,
            stop,
            reasoningEffort,
            thinkingBudget,
            customParameters = {}
        } = options;

        let body: any = {
            model: this.config.modelName,
            stream: streaming,
            ...customParameters
        };

        // Apply parameter mapping if configured
        const paramMapping = this.config.parameterMapping || {};

        // Check format - default to 'chat' for backward compatibility
        const format = this.config.format || 'chat';

        // Handle parameters differently based on inheritance
        if (this.config.inherit === 'google') {
            // Google uses generationConfig for parameters
            const generationConfig: any = {};
            if (temperature !== undefined) generationConfig.temperature = temperature;
            if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;
            if (topP !== undefined) generationConfig.topP = topP;
            if (topK !== undefined) generationConfig.topK = topK;
            if (stop !== undefined) generationConfig.stopSequences = Array.isArray(stop) ? stop : [stop];
            
            if (Object.keys(generationConfig).length > 0) {
                body.generationConfig = generationConfig;
            }
        } else {
            // Other providers use direct parameters with optional mapping
            body[paramMapping.temperature || 'temperature'] = temperature;
            body[paramMapping.maxTokens || 'max_tokens'] = maxTokens;
            
            if (topP !== undefined) body[paramMapping.topP || 'top_p'] = topP;
            if (topK !== undefined) body[paramMapping.topK || 'top_k'] = topK;
            if (presencePenalty !== undefined) body[paramMapping.presencePenalty || 'presence_penalty'] = presencePenalty;
            if (frequencyPenalty !== undefined) body[paramMapping.frequencyPenalty || 'frequency_penalty'] = frequencyPenalty;
            if (stop !== undefined) body[paramMapping.stop || 'stop'] = stop;
        }

        // Handle reasoning parameters based on inheritance
        this.applyReasoningParameters(body, reasoningEffort, thinkingBudget, paramMapping);

        // Apply messages and system prompt based on provider and format
        if (format === 'completions') {
            this.applyCompletionsFormat(body, optionMessages, systemPrompt);
        } else {
            this.applyMessagesAndSystem(body, optionMessages, systemPrompt);
        }

        // Apply parameter overrides
        if (this.config.parameters) {
            for (const [key, value] of Object.entries(this.config.parameters)) {
                if (value === null) {
                    // null means delete this parameter entirely
                    console.log(`[GenericHttpClient] Deleting parameter: ${key}`);
                    delete body[key];
                } else {
                    // Any other value (including undefined, false, 0) gets set
                    console.log(`[GenericHttpClient] Setting parameter: ${key} = ${value}`);
                    body[key] = value;
                }
            }
            console.log(`[GenericHttpClient] Body after parameter overrides:`, JSON.stringify(body, null, 2));
        }

        return body;
    }

    private applyReasoningParameters(
        body: any, 
        reasoningEffort?: 'low' | 'medium' | 'high', 
        thinkingBudget?: number,
        paramMapping: any = {}
    ): void {
        switch (this.config.inherit) {
            case 'openai':
            case 'together':
            case 'xai':
            case 'openrouter':
                if (reasoningEffort) {
                    body[paramMapping.reasoningEffort || 'reasoning_effort'] = reasoningEffort;
                }
                break;
            
            case 'anthropic':
                if (thinkingBudget || reasoningEffort) {
                    const budget = thinkingBudget || this.mapEffortToBudget(reasoningEffort);
                    if (budget) {
                        body[paramMapping.thinkingBudget || 'thinking'] = {
                            type: 'enabled',
                            budget_tokens: budget
                        };
                    }
                }
                break;
            
            case 'google':
                if (thinkingBudget || reasoningEffort) {
                    const budget = thinkingBudget || this.mapEffortToBudget(reasoningEffort);
                    if (budget) {
                        body[paramMapping.thinkingBudget || 'thinkingConfig'] = {
                            thinkingBudget: budget
                        };
                    }
                }
                break;
            
            case 'mistral':
                // Mistral uses OpenAI-style reasoning effort
                if (reasoningEffort) {
                    body[paramMapping.reasoningEffort || 'reasoning_effort'] = reasoningEffort;
                }
                break;
        }
    }

    private mapEffortToBudget(effort?: 'low' | 'medium' | 'high'): number | undefined {
        switch (effort) {
            case 'low': return 1024;
            case 'medium': return 4096;
            case 'high': return 8192;
            default: return undefined;
        }
    }

    private applyMessagesAndSystem(body: any, messages?: { role: string; content: string }[], systemPrompt?: string): void {
        switch (this.config.inherit) {
            case 'anthropic':
                // Anthropic uses separate system field and filters messages
                if (systemPrompt) {
                    body.system = systemPrompt;
                }
                body.messages = messages?.filter(m => m.role === 'user' || m.role === 'assistant') || [];
                break;
            
            case 'google':
                // Google Gemini has a different structure
                const contents: any[] = [];
                if (systemPrompt) {
                    body.systemInstruction = {
                        parts: [{ text: systemPrompt }]
                    };
                }
                messages?.forEach(msg => {
                    contents.push({
                        role: msg.role === 'assistant' ? 'model' : msg.role,
                        parts: [{ text: msg.content }]
                    });
                });
                body.contents = contents;
                // Remove OpenAI-style messages field for Google
                delete body.messages;
                break;
            
            case 'openai':
            case 'mistral':
            case 'together':
            case 'xai':
            case 'openrouter':
            default:
                // OpenAI-style: messages array with optional system message
                const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
                if (messages && messages.length > 0) {
                    apiMessages.push(...messages.filter(m => ['user', 'assistant', 'system'].includes(m.role)).map(m => ({ 
                        role: m.role as 'user' | 'assistant' | 'system', 
                        content: m.content || '' 
                    })));
                    if (systemPrompt && !apiMessages.find(m => m.role === 'system')) {
                         apiMessages.unshift({ role: 'system', content: systemPrompt });
                    }
                }
                body.messages = apiMessages;
                break;
        }
    }

    private applyCompletionsFormat(body: any, messages?: { role: string; content: string }[], systemPrompt?: string): void {
        // Check if this is a raw prompt format (just use the prompt text directly)
        const useRawFormat = this.config.promptFormat === 'raw';
        
        if (useRawFormat) {
            // For raw format, create a natural prompt that includes conversation context
            let prompt = '';
            
            // Add system prompt if present
            if (systemPrompt) {
                prompt += systemPrompt + '\n\n';
            }
            
            // For raw format, convert the conversation to a more natural flow
            if (messages && messages.length > 0) {
                messages.forEach(msg => {
                    if (msg.role === 'system' && !systemPrompt) {
                        // If we haven't added a system prompt yet, add this one
                        prompt += msg.content + '\n\n';
                    } else if (msg.role === 'user') {
                        // For multi-turn, we might want to preserve some context
                        // but for simple completions, just use the content directly
                        if (messages.length === 1) {
                            // Single user message - just use it as the prompt
                            prompt += msg.content;
                        } else {
                            // Multi-turn conversation - include context but without role labels
                            prompt += msg.content + '\n\n';
                        }
                    } else if (msg.role === 'assistant') {
                        // Include assistant responses in multi-turn for context
                        prompt += msg.content + '\n\n';
                    }
                });
            }
            
            body.prompt = prompt.trim();
        } else {
            // Original conversational format
            // Convert messages array to a single prompt string for completions endpoints
            let prompt = '';
            
            // Add system prompt if present
            if (systemPrompt) {
                prompt += systemPrompt + '\n\n';
            }
            
            // Convert messages to a simple conversation format
            if (messages && messages.length > 0) {
                messages.forEach(msg => {
                    if (msg.role === 'system' && !systemPrompt) {
                        // If we haven't added a system prompt yet, add this one
                        prompt += msg.content + '\n\n';
                    } else if (msg.role === 'user') {
                        prompt += 'User: ' + msg.content + '\n';
                    } else if (msg.role === 'assistant') {
                        prompt += 'Assistant: ' + msg.content + '\n';
                    }
                });
                
                // For completions, we typically want to end with a prompt for the assistant to continue
                if (!prompt.endsWith('Assistant: ')) {
                    prompt += 'Assistant:';
                }
            }
            
            body.prompt = prompt.trim();
        }
        
        // Remove any chat-style fields that might have been set
        delete body.messages;
        delete body.system;
        delete body.contents;
        delete body.systemInstruction;
    }

    private parseResponse(jsonResponse: any): string {
        const format = this.config.format || 'chat';
        
        if (format === 'completions') {
            // For completions format, response is in choices[].text
            return jsonResponse.choices?.[0]?.text?.trim() ?? '';
        }
        
        // For chat format, use provider-specific parsing
        switch (this.config.inherit) {
            case 'anthropic':
                return jsonResponse.content?.[0]?.text?.trim() ?? '';
            
            case 'google':
                return jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
            
            case 'openai':
            case 'mistral':
            case 'together':
            case 'xai':
            case 'openrouter':
            default:
                return jsonResponse.choices?.[0]?.message?.content?.trim() ?? '';
        }
    }

    private parseStreamChunk(parsed: any): string | undefined {
        const format = this.config.format || 'chat';
        
        if (format === 'completions') {
            // For completions format streaming, content is in choices[].text
            return parsed.choices?.[0]?.text;
        }
        
        // For chat format, use provider-specific parsing
        switch (this.config.inherit) {
            case 'anthropic':
                if (parsed.type === 'content_block_delta') {
                    return parsed.delta?.text;
                }
                break;
            
            case 'google':
                return parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            
            case 'openai':
            case 'mistral':
            case 'together':
            case 'xai':
            case 'openrouter':
            default:
                return parsed.choices?.[0]?.delta?.content;
        }
        return undefined;
    }

    private extractReasoningContent(jsonResponse: any): string | undefined {
        switch (this.config.inherit) {
            case 'anthropic':
                // Anthropic may have thinking blocks in response
                return jsonResponse.thinking;
            
            case 'google':
                // Google reasoning content (if available)
                return jsonResponse.candidates?.[0]?.content?.reasoning;
            
            case 'openai':
            case 'together':
            case 'xai':
            case 'openrouter':
                // OpenAI o-series and compatible models may expose reasoning
                return jsonResponse.reasoning_content;
            
            case 'mistral':
            default:
                // Check for DeepSeek-style reasoning content
                return jsonResponse.reasoning_content;
        }
    }

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
        const { timeout = 120000 } = options;
        const fetch = (await import('node-fetch')).default;

        const body = this.buildRequestBody(options, false);

        // Debug logging for custom model requests
        console.log(`[GenericHttpClient] Making request to custom model ${this.config.id}`);
        console.log(`[GenericHttpClient] URL: ${this.config.url}`);
        console.log(`[GenericHttpClient] Request body:`, JSON.stringify(body, null, 2));
        console.log(`[GenericHttpClient] Headers:`, JSON.stringify(this.getHeaders(), null, 2));

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(this.config.url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                console.log(`[GenericHttpClient] Error response from ${this.config.id}:`, errorBody);
                return { responseText: '', error: `Custom API Error (${this.config.id}): ${response.status} ${response.statusText} - ${errorBody}` };
            }

            const jsonResponse = await response.json() as any;
            
            const responseText = this.parseResponse(jsonResponse);
            const reasoningContent = this.extractReasoningContent(jsonResponse);

            const result: LLMApiCallResult = { responseText };
            if (reasoningContent) {
                // Add reasoning content as additional data
                (result as any).reasoningContent = reasoningContent;
            }

            return result;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { responseText: '', error: `Custom API request timed out after ${timeout}ms` };
            }
            return { responseText: '', error: `Network or other error calling Custom API (${this.config.id}): ${error.message}` };
        }
    }

    public async *streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk> {
        const { timeout = 120000 } = options;
        const fetch = (await import('node-fetch')).default;

        const body = this.buildRequestBody(options, true);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(this.config.url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok || !response.body) {
                const errorBody = await response.text();
                yield { type: 'error', error: `Custom API stream Error (${this.config.id}): ${response.status} ${response.statusText} - ${errorBody}` };
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
                            const content = this.parseStreamChunk(parsed);
                            
                            if (content) {
                                yield { type: 'content', content };
                            }

                            // Handle reasoning content in streaming responses
                            const reasoningContent = this.extractReasoningContent(parsed);
                            if (reasoningContent) {
                                yield { type: 'reasoning', content: reasoningContent } as StreamChunk;
                            }
                        } catch (e) {
                            // Ignore parsing errors for incomplete JSON chunks
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                yield { type: 'error', error: `Custom API stream request timed out after ${timeout}ms` };
            } else {
                yield { type: 'error', error: `Network or other error during Custom API stream (${this.config.id}): ${error.message}` };
            }
        }
    }
}

export { GenericHttpClient }; 