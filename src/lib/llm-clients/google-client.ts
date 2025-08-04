import { LLMApiCallOptions, LLMApiCallResult, StreamChunk } from './types';
import crypto from 'crypto';
import { ConversationMessage } from '@/types/shared';

const GOOGLE_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Helper to transform our standard messages to Google's format
function toGoogleMessages(messages: ConversationMessage[], systemPrompt?: string | null) {
    const googleMessages: any[] = [];
    if (systemPrompt) {
        // Google's format supports a system instruction object
        googleMessages.push({
            role: 'system',
            parts: [{ text: systemPrompt }]
        });
    }
    messages.forEach(msg => {
        // The Gemini API requires alternating user and model roles.
        // We'll map 'assistant' to 'model'.
        if (msg.role === 'assistant') {
            googleMessages.push({ role: 'model', parts: [{ text: msg.content }] });
        } else {
            googleMessages.push({ role: 'user', parts: [{ text: msg.content }] });
        }
    });
    return googleMessages;
}

class GoogleClient {
    private apiKey: string;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.GOOGLE_API_KEY;
        if (!key) {
            throw new Error('GOOGLE_API_KEY is not set in environment variables');
        }
        this.apiKey = key;
    }

    private getUrl(modelName: string, stream: boolean = false): string {
        const action = stream ? 'streamGenerateContent' : 'generateContent';
        return `${GOOGLE_API_BASE_URL}/${modelName}:${action}?key=${this.apiKey}`;
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
        };
    }

    public async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
        // Extract modelName from modelId (format: "google:gemini-pro")
        const modelName = options.modelId.split(':')[1] || options.modelId;
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 1500, timeout = 30000 } = options;
        const fetch = (await import('node-fetch')).default;

        // Convert messages to ConversationMessage type
        const conversationMessages: ConversationMessage[] = messages?.map(m => ({
            role: m.role as ConversationMessage['role'],
            content: m.content
        })) || [];

        const body = JSON.stringify({
            contents: toGoogleMessages(conversationMessages, systemPrompt),
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(this.getUrl(modelName, false), {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                return { responseText: '', error: `Google API Error: ${response.status} ${response.statusText} - ${errorBody}` };
            }

            const jsonResponse = await response.json() as any;
            const responseText = jsonResponse.candidates[0]?.content?.parts[0]?.text?.trim() ?? '';
            const result: LLMApiCallResult = { responseText };

            return result;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { responseText: '', error: `Google API request timed out after ${timeout}ms` };
            }
            return { responseText: '', error: `Network or other error calling Google API: ${error.message}` };
        }
    }

    public async *streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk> {
        // Extract modelName from modelId (format: "google:gemini-pro")
        const modelName = options.modelId.split(':')[1] || options.modelId;
        const { messages, systemPrompt, temperature = 0.3, maxTokens = 2000, timeout = 30000 } = options;
        const fetch = (await import('node-fetch')).default;

        // Convert messages to ConversationMessage type
        const conversationMessages: ConversationMessage[] = messages?.map(m => ({
            role: m.role as ConversationMessage['role'],
            content: m.content
        })) || [];

        const body = JSON.stringify({
            contents: toGoogleMessages(conversationMessages, systemPrompt),
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(this.getUrl(modelName, true), {
                method: 'POST',
                headers: this.getHeaders(),
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok || !response.body) {
                const errorBody = await response.text();
                yield { type: 'error', error: `Google stream Error: ${response.status} ${response.statusText} - ${errorBody}` };
                return;
            }

            for await (const chunk of response.body) {
                const lines = chunk.toString().split('\n');
                 for (const line of lines) {
                    if (line.startsWith(' "text": "')) {
                        try {
                            // This is a simplified parser for Google's verbose stream format.
                            // It extracts the content from lines like: "text": "Some content here"
                            const content = line.match(/"text":\s*"(.*?)"/)?.[1];
                            if (content) {
                                // The stream sends back escaped characters, we need to unescape them.
                                yield { type: 'content', content: content.replace(/\\n/g, '\n').replace(/\\"/g, '"') };
                            }
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                yield { type: 'error', error: `Google stream request timed out after ${timeout}ms` };
            } else {
                yield { type: 'error', error: `Network or other error during Google stream: ${error.message}` };
            }
        }
    }
}

export { GoogleClient }; 