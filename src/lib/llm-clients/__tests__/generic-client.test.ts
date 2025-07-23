import { GenericHttpClient } from '../generic-client';
import { CustomModelDefinition, LLMApiCallOptions } from '../types';

// Create a test version of GenericHttpClient that exposes the internal methods
class TestableGenericHttpClient extends GenericHttpClient {
    constructor(config: CustomModelDefinition) {
        super(config);
    }

    // Expose the private buildRequestBody method for testing
    public testBuildRequestBody(options: LLMApiCallOptions, streaming = false): any {
        return (this as any).buildRequestBody(options, streaming);
    }

    // Expose the private getHeaders method for testing
    public testGetHeaders(): Record<string, string> {
        return (this as any).getHeaders();
    }
}

describe('GenericHttpClient', () => {
    describe('Request body building', () => {
        describe('OpenAI-compatible inheritance', () => {
            it('should build correct request body for OpenAI format', () => {
                const customModel: CustomModelDefinition = {
                    id: 'local:llama',
                    url: 'http://localhost:11434/v1/chat/completions',
                    modelName: 'llama3:instruct',
                    inherit: 'openai',
                    headers: { 'Authorization': 'Bearer test-key' }
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'local:llama',
                    messages: [{ role: 'user', content: 'Hello' }],
                    systemPrompt: 'You are a helpful assistant.',
                    temperature: 0.7,
                    maxTokens: 1000
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.model).toBe('llama3:instruct');
                expect(body.messages).toEqual([
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Hello' }
                ]);
                expect(body.temperature).toBe(0.7);
                expect(body.max_tokens).toBe(1000);
                expect(body.stream).toBe(false);
            });

            it('should handle reasoning parameters for OpenAI format', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:reasoning-model',
                    url: 'http://custom-reasoning.com/v1/chat/completions',
                    modelName: 'reasoning-o1',
                    inherit: 'openai'
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:reasoning-model',
                    messages: [{ role: 'user', content: 'Solve this problem' }],
                    reasoningEffort: 'high',
                    temperature: 0.3
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.reasoning_effort).toBe('high');
                expect(body.temperature).toBe(0.3);
                expect(body.model).toBe('reasoning-o1');
            });

            it('should handle streaming mode for OpenAI format', () => {
                const customModel: CustomModelDefinition = {
                    id: 'local:streaming',
                    url: 'http://localhost:11434/v1/chat/completions',
                    modelName: 'streaming-model',
                    inherit: 'openai'
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'local:streaming',
                    messages: [{ role: 'user', content: 'Stream this' }]
                };

                const body = client.testBuildRequestBody(options, true);

                expect(body.stream).toBe(true);
                expect(body.model).toBe('streaming-model');
            });
        });

        describe('Anthropic-compatible inheritance', () => {
            it('should build correct request body for Anthropic format', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:claude-like',
                    url: 'http://custom-claude.com/v1/messages',
                    modelName: 'custom-claude-3',
                    inherit: 'anthropic'
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:claude-like',
                    messages: [
                        { role: 'user', content: 'Hello' },
                        { role: 'assistant', content: 'Hi there!' },
                        { role: 'user', content: 'How are you?' }
                    ],
                    systemPrompt: 'You are Claude.',
                    temperature: 0.5
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.model).toBe('custom-claude-3');
                expect(body.system).toBe('You are Claude.');
                expect(body.messages).toEqual([
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there!' },
                    { role: 'user', content: 'How are you?' }
                ]);
                expect(body.temperature).toBe(0.5);
                expect(body.stream).toBe(false);
            });

            it('should handle reasoning parameters for Anthropic format', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:thinking-claude',
                    url: 'http://thinking-claude.com/v1/messages',
                    modelName: 'thinking-claude',
                    inherit: 'anthropic'
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:thinking-claude',
                    messages: [{ role: 'user', content: 'Think step by step' }],
                    thinkingBudget: 1000
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 1000 });
                expect(body.model).toBe('thinking-claude');
            });
        });

        describe('Google-compatible inheritance', () => {
            it('should build correct request body for Google format', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:gemini-like',
                    url: 'http://custom-gemini.com/v1/models/custom-gemini:generateContent',
                    modelName: 'custom-gemini',
                    inherit: 'google'
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:gemini-like',
                    messages: [{ role: 'user', content: 'Hello' }],
                    systemPrompt: 'You are Gemini.',
                    temperature: 0.8
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.contents).toEqual([
                    { role: 'user', parts: [{ text: 'Hello' }] }
                ]);
                expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are Gemini.' }] });
                expect(body.generationConfig).toBeDefined();
                expect(body.generationConfig.temperature).toBe(0.8);
            });

            it('should handle conversation with assistant messages for Google format', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:gemini-conversation',
                    url: 'http://custom-gemini.com/v1/models/custom-gemini:generateContent',
                    modelName: 'custom-gemini',
                    inherit: 'google'
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:gemini-conversation',
                    messages: [
                        { role: 'user', content: 'Hello' },
                        { role: 'assistant', content: 'Hi there!' },
                        { role: 'user', content: 'How are you?' }
                    ]
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.contents).toEqual([
                    { role: 'user', parts: [{ text: 'Hello' }] },
                    { role: 'model', parts: [{ text: 'Hi there!' }] },
                    { role: 'user', parts: [{ text: 'How are you?' }] }
                ]);
            });
        });

        describe('Parameter mapping and defaults', () => {
            it('should apply parameter mapping overrides', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:mapped-params',
                    url: 'http://custom-api.com/generate',
                    modelName: 'custom-model',
                    inherit: 'openai',
                    parameterMapping: {
                        temperature: 'heat',
                        maxTokens: 'token_limit',
                        topP: 'nucleus_sampling'
                    }
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:mapped-params',
                    messages: [{ role: 'user', content: 'Test' }],
                    temperature: 0.9,
                    maxTokens: 2000,
                    topP: 0.95
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.heat).toBe(0.9);
                expect(body.token_limit).toBe(2000);
                expect(body.nucleus_sampling).toBe(0.95);
                // Standard parameters shouldn't be present when mapped
                expect(body.temperature).toBeUndefined();
                expect(body.max_tokens).toBeUndefined();
                expect(body.top_p).toBeUndefined();
            });

            it('should apply custom parameters', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:with-params',
                    url: 'http://custom-api.com/generate',
                    modelName: 'custom-model',
                    inherit: 'openai',
                    parameters: {
                        stop: ['END', 'STOP'],
                        presence_penalty: 0.1,
                        custom_param: 'custom_value'
                    }
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:with-params',
                    messages: [{ role: 'user', content: 'Test' }]
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.stop).toEqual(['END', 'STOP']);
                expect(body.presence_penalty).toBe(0.1);
                expect(body.custom_param).toBe('custom_value');
            });

            it('should prioritize parameters over system defaults', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:priority-test',
                    url: 'http://custom-api.com/generate',
                    modelName: 'custom-model',
                    inherit: 'openai',
                    parameters: {
                        temperature: 0.1,
                        max_tokens: 50
                    }
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:priority-test',
                    messages: [{ role: 'user', content: 'Test' }],
                    temperature: 0.8,  // This gets overridden by parameters
                    maxTokens: 100     // This gets overridden by parameters
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.temperature).toBe(0.1); // parameters override wins
                expect(body.max_tokens).toBe(50); // parameters override wins
            });
        });

        describe('Advanced parameters', () => {
            it('should handle all advanced parameters correctly', () => {
                const customModel: CustomModelDefinition = {
                    id: 'custom:advanced',
                    url: 'http://advanced-api.com/generate',
                    modelName: 'advanced-model',
                    inherit: 'openai'
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: 'custom:advanced',
                    messages: [{ role: 'user', content: 'Test advanced params' }],
                    temperature: 0.7,
                    maxTokens: 1500,
                    topP: 0.9,
                    topK: 50,
                    presencePenalty: 0.1,
                    frequencyPenalty: 0.2,
                    stop: ['STOP', 'END'],
                    customParameters: {
                        custom_field: 'custom_value',
                        another_param: 123
                    }
                };

                const body = client.testBuildRequestBody(options, false);

                expect(body.temperature).toBe(0.7);
                expect(body.max_tokens).toBe(1500);
                expect(body.top_p).toBe(0.9);
                expect(body.top_k).toBe(50);
                expect(body.presence_penalty).toBe(0.1);
                expect(body.frequency_penalty).toBe(0.2);
                expect(body.stop).toEqual(['STOP', 'END']);
                expect(body.custom_field).toBe('custom_value');
                expect(body.another_param).toBe(123);
            });
        });
    });

    describe('Headers configuration', () => {
        it('should include custom headers', () => {
            const customModel: CustomModelDefinition = {
                id: 'custom:with-headers',
                url: 'http://custom-api.com/generate',
                modelName: 'custom-model',
                inherit: 'openai',
                headers: {
                    'Authorization': 'Bearer custom-token',
                    'X-Custom-Header': 'custom-value'
                }
            };

            const client = new TestableGenericHttpClient(customModel);
            const headers = client.testGetHeaders();

            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['Authorization']).toBe('Bearer custom-token');
            expect(headers['X-Custom-Header']).toBe('custom-value');
        });

        it('should always include Content-Type header', () => {
            const customModel: CustomModelDefinition = {
                id: 'custom:minimal',
                url: 'http://custom-api.com/generate',
                modelName: 'custom-model',
                inherit: 'openai'
            };

            const client = new TestableGenericHttpClient(customModel);
            const headers = client.testGetHeaders();

            expect(headers['Content-Type']).toBe('application/json');
        });
    });

    describe('Inheritance pattern validation', () => {
        it('should handle all supported inheritance patterns', () => {
            const inheritancePatterns: Array<{ inherit: CustomModelDefinition['inherit'], expectedFields: string[] }> = [
                { inherit: 'openai', expectedFields: ['model', 'messages', 'stream'] },
                { inherit: 'anthropic', expectedFields: ['model', 'messages', 'stream'] },
                { inherit: 'google', expectedFields: ['contents'] },
                { inherit: 'mistral', expectedFields: ['model', 'messages', 'stream'] },
                { inherit: 'together', expectedFields: ['model', 'messages', 'stream'] },
                { inherit: 'xai', expectedFields: ['model', 'messages', 'stream'] },
                { inherit: 'openrouter', expectedFields: ['model', 'messages', 'stream'] }
            ];

            inheritancePatterns.forEach(({ inherit, expectedFields }) => {
                const customModel: CustomModelDefinition = {
                    id: `custom:${inherit}`,
                    url: `http://${inherit}-api.com/generate`,
                    modelName: `${inherit}-model`,
                    inherit
                };

                const client = new TestableGenericHttpClient(customModel);
                const options: LLMApiCallOptions = {
                    modelId: `custom:${inherit}`,
                    messages: [{ role: 'user', content: 'Test' }]
                };

                const body = client.testBuildRequestBody(options, false);

                expectedFields.forEach(field => {
                    expect(body).toHaveProperty(field);
                });
            });
        });
    });

    describe('Completions format support', () => {
        it('should convert messages to prompt format for completions', () => {
            const customModel: CustomModelDefinition = {
                id: 'local:llama',
                url: 'http://localhost:4891/v1/completions',
                modelName: 'llama-3-8b-instruct',
                inherit: 'openai',
                format: 'completions'
            };

            const client = new TestableGenericHttpClient(customModel);
            const options: LLMApiCallOptions = {
                modelId: 'local:llama',
                messages: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there!' },
                    { role: 'user', content: 'How are you?' }
                ]
            };

            const body = client.testBuildRequestBody(options, false);

            expect(body.prompt).toContain('User: Hello');
            expect(body.prompt).toContain('Assistant: Hi there!');
            expect(body.prompt).toContain('User: How are you?');
            expect(body.prompt).toContain('Assistant:');
            expect(body.messages).toBeUndefined();
        });

        it('should include system prompt in completions format', () => {
            const customModel: CustomModelDefinition = {
                id: 'local:llama',
                url: 'http://localhost:4891/v1/completions',
                modelName: 'llama-3-8b-instruct',
                inherit: 'openai',
                format: 'completions'
            };

            const client = new TestableGenericHttpClient(customModel);
            const options: LLMApiCallOptions = {
                modelId: 'local:llama',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are a helpful assistant.'
            };

            const body = client.testBuildRequestBody(options, false);

            expect(body.prompt).toContain('You are a helpful assistant.');
            expect(body.prompt).toContain('User: Hello');
            expect(body.prompt).toContain('Assistant:');
            expect(body.messages).toBeUndefined();
            expect(body.system).toBeUndefined();
        });

        it('should default to chat format when format is not specified', () => {
            const customModel: CustomModelDefinition = {
                id: 'custom:default-format',
                url: 'http://custom-api.com/chat/completions',
                modelName: 'custom-model',
                inherit: 'openai'
                // format not specified, should default to 'chat'
            };

            const client = new TestableGenericHttpClient(customModel);
            const options: LLMApiCallOptions = {
                modelId: 'custom:default-format',
                messages: [{ role: 'user', content: 'Hello' }]
            };

            const body = client.testBuildRequestBody(options, false);

            expect(body.messages).toBeDefined();
            expect(body.prompt).toBeUndefined();
        });

        it('should handle chat format explicitly when specified', () => {
            const customModel: CustomModelDefinition = {
                id: 'custom:explicit-chat',
                url: 'http://custom-api.com/chat/completions',
                modelName: 'custom-model',
                inherit: 'openai',
                format: 'chat'
            };

            const client = new TestableGenericHttpClient(customModel);
            const options: LLMApiCallOptions = {
                modelId: 'custom:explicit-chat',
                messages: [{ role: 'user', content: 'Hello' }]
            };

            const body = client.testBuildRequestBody(options, false);

            expect(body.messages).toBeDefined();
            expect(body.prompt).toBeUndefined();
        });
    });

    describe('Parameter overrides with null deletion', () => {
        it('should set parameter values and delete null parameters', () => {
            const customModel: CustomModelDefinition = {
                id: 'custom:clean-params',
                url: 'http://custom-api.com/generate',
                modelName: 'clean-model',
                inherit: 'openai',
                parameters: {
                    max_tokens: 100,      // Override system default
                    stream: null,         // Delete entirely
                    custom_field: 'value', // Add custom parameter
                    temperature: 0.9      // Override system value
                }
            };

            const client = new TestableGenericHttpClient(customModel);
            const options: LLMApiCallOptions = {
                modelId: 'custom:clean-params',
                messages: [{ role: 'user', content: 'Test' }],
                temperature: 0.5,  // This gets overridden by parameters
                maxTokens: 2000    // This gets overridden by parameters
            };

            const body = client.testBuildRequestBody(options, false);

            // Parameters should override system values
            expect(body.max_tokens).toBe(100);
            expect(body.temperature).toBe(0.9);
            expect(body.custom_field).toBe('value');
            
            // stream should be completely removed (null deletion)
            expect(body.stream).toBeUndefined();
            expect('stream' in body).toBe(false);
        });

        it('should handle edge cases with falsy values', () => {
            const customModel: CustomModelDefinition = {
                id: 'custom:edge-cases',
                url: 'http://custom-api.com/generate',
                modelName: 'edge-model',
                inherit: 'openai',
                parameters: {
                    zero_value: 0,          // Should be set to 0
                    false_value: false,     // Should be set to false
                    empty_string: '',       // Should be set to empty string
                    undefined_value: undefined, // Should be set to undefined
                    null_value: null        // Should be deleted
                }
            };

            const client = new TestableGenericHttpClient(customModel);
            const options: LLMApiCallOptions = {
                modelId: 'custom:edge-cases',
                messages: [{ role: 'user', content: 'Test' }]
            };

            const body = client.testBuildRequestBody(options, false);

            // All falsy values except null should be preserved
            expect(body.zero_value).toBe(0);
            expect(body.false_value).toBe(false);
            expect(body.empty_string).toBe('');
            expect(body.undefined_value).toBeUndefined();
            expect('undefined_value' in body).toBe(true);
            
            // Only null should be deleted
            expect('null_value' in body).toBe(false);
        });
    });


});