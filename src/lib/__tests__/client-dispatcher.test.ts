import { jest } from '@jest/globals';
import { BaseLLMClient, LLMApiCallOptions, LLMApiCallResult, StreamChunk } from '../llm-clients/types';

// This is a generic mock client class.
// We can spy on its constructor and methods to test the dispatcher's behavior.
const mockMakeApiCall = jest.fn<(options: LLMApiCallOptions) => Promise<LLMApiCallResult>>();
const mockStreamApiCall = jest.fn<(options: LLMApiCallOptions) => AsyncGenerator<StreamChunk, void, undefined>>();
const mockConstructor = jest.fn();

class MockLLMClient extends BaseLLMClient {
    constructor() {
        super();
        mockConstructor();
    }
    makeApiCall = mockMakeApiCall;
    streamApiCall = mockStreamApiCall;
}

// Mock all the client modules that client-dispatcher imports.
// They will all be replaced by our single MockLLMClient.
jest.mock('../llm-clients/openai-client', () => ({ OpenAIClient: MockLLMClient }));
jest.mock('../llm-clients/anthropic-client', () => ({ AnthropicClient: MockLLMClient }));
jest.mock('../llm-clients/google-client', () => ({ GoogleClient: MockLLMClient }));
jest.mock('../llm-clients/mistral-client', () => ({ MistralClient: MockLLMClient }));
jest.mock('../llm-clients/together-client', () => ({ TogetherClient: MockLLMClient }));
jest.mock('../llm-clients/xai-client', () => ({ XaiClient: MockLLMClient }));
jest.mock('../llm-clients/openrouter-client', () => ({ OpenRouterModuleClient: MockLLMClient }));
jest.mock('../llm-clients/generic-client', () => ({ GenericHttpClient: MockLLMClient }));


describe('LLM Client Dispatcher', () => {
    let dispatchMakeApiCall: any;
    let dispatchStreamApiCall: any;
    let registerCustomModels: any;

    beforeEach(() => {
        // Resetting modules is crucial to clear the internal `clientInstances` cache in the dispatcher
        jest.resetModules();
        
        // Re-import the dispatcher to get a fresh instance with an empty cache
        const dispatcher = require('../llm-clients/client-dispatcher');
        dispatchMakeApiCall = dispatcher.dispatchMakeApiCall;
        dispatchStreamApiCall = dispatcher.dispatchStreamApiCall;
        registerCustomModels = dispatcher.registerCustomModels;

        // Clear mocks before each test
        mockMakeApiCall.mockClear();
        mockStreamApiCall.mockClear();
        mockConstructor.mockClear();
        
        // Mock a successful response by default to avoid cascading errors in tests that don't focus on failure cases.
        mockMakeApiCall.mockResolvedValue({ responseText: 'mock response' });
    });

    describe('Error Handling and Model ID Parsing', () => {
        it('should throw an error for an invalid modelId format (no colon)', async () => {
            const options = { modelId: 'invalid-id', messages: [{role: 'user', content: 'test'}] };
            await expect(dispatchMakeApiCall(options)).rejects.toThrow(
                'Invalid modelId format: "invalid-id". Expected "<provider>:<model-name>" for standard models, or a registered custom model ID.'
            );
        });

        it('should throw an error for an invalid modelId format (multiple colons)', async () => {
            const options = { modelId: 'provider:model:extra', messages: [{role: 'user', content: 'test'}] };
            await expect(dispatchMakeApiCall(options)).rejects.toThrow(
                'Invalid modelId format: "provider:model:extra". Expected "<provider>:<model-name>" for standard models, or a registered custom model ID.'
            );
        });

        it('should throw an error for an unsupported provider', async () => {
            const options = { modelId: 'unsupported:some-model', messages: [{role: 'user', content: 'test'}] };
            await expect(dispatchMakeApiCall(options)).rejects.toThrow(
                'Unsupported LLM provider: "unsupported" from model ID "unsupported:some-model". No matching custom model registered.'
            );
        });
    });

    describe('Custom Model Support', () => {
        it('should register and use custom models', async () => {
            const customModels = [{
                id: 'custom:test-model',
                url: 'http://localhost:8080/v1/chat/completions',
                modelName: 'test-model',
                inherit: 'openai' as const,
                headers: { 'Authorization': 'Bearer test-key' }
            }];

            registerCustomModels(customModels);

            const options = { modelId: 'custom:test-model', messages: [{role: 'user', content: 'test'}] };
            await dispatchMakeApiCall(options);

            expect(mockMakeApiCall).toHaveBeenCalledTimes(1);
            expect(mockMakeApiCall).toHaveBeenCalledWith(options);
        });

        it('should prefer custom models over standard provider parsing', async () => {
            const customModels = [{
                id: 'openai:custom-override',
                url: 'http://custom-server.com/v1/chat',
                modelName: 'custom-gpt',
                inherit: 'anthropic' as const
            }];

            registerCustomModels(customModels);

            const options = { modelId: 'openai:custom-override', messages: [{role: 'user', content: 'test'}] };
            await dispatchMakeApiCall(options);

            // Should use the custom model, not the standard OpenAI client
            expect(mockMakeApiCall).toHaveBeenCalledTimes(1);
        });

        it('should throw an error for unregistered custom model ID', async () => {
            const options = { modelId: 'custom:unregistered-model', messages: [{role: 'user', content: 'test'}] };
            await expect(dispatchMakeApiCall(options)).rejects.toThrow(
                'Unsupported LLM provider: "custom" from model ID "custom:unregistered-model". No matching custom model registered.'
            );
        });

        it('should handle streaming calls for custom models', async () => {
            const customModels = [{
                id: 'local:llama',
                url: 'http://localhost:11434/v1/chat/completions',
                modelName: 'llama3:instruct',
                inherit: 'openai' as const
            }];

            registerCustomModels(customModels);

            const options = { modelId: 'local:llama', messages: [{role: 'user', content: 'test'}] };
            dispatchStreamApiCall(options);

            expect(mockStreamApiCall).toHaveBeenCalledTimes(1);
            expect(mockStreamApiCall).toHaveBeenCalledWith(options);
        });
    });

    describe('dispatchMakeApiCall', () => {
        it('should dispatch to the correct client and pass the right arguments', async () => {
            const options = { modelId: 'openai:gpt-4o', temperature: 0.5, messages: [{role: 'user', content: 'test'}] };
            await dispatchMakeApiCall(options);
            
            expect(mockMakeApiCall).toHaveBeenCalledTimes(1);
            expect(mockMakeApiCall).toHaveBeenCalledWith(options);
        });

        it('should handle model names with slashes for providers like openrouter', async () => {
            const options = { modelId: 'openrouter:google/gemini-pro', messages: [{role: 'user', content: 'test'}] };
            await dispatchMakeApiCall(options);

            expect(mockMakeApiCall).toHaveBeenCalledTimes(1);
            expect(mockMakeApiCall).toHaveBeenCalledWith(options);
        });

        it('should be case-insensitive for the provider name', async () => {
            const options = { modelId: 'Google:gemini-1.5-flash', messages: [{role: 'user', content: 'test'}] };
            await dispatchMakeApiCall(options);
            
            expect(mockMakeApiCall).toHaveBeenCalledTimes(1);
            expect(mockMakeApiCall).toHaveBeenCalledWith(options);
        });
    });

    describe('dispatchStreamApiCall', () => {
       it('should dispatch to the correct client for streaming calls', async () => {
            const options = { modelId: 'anthropic:claude-3-opus', messages: [{role: 'user', content: 'test'}] };
            dispatchStreamApiCall(options);

            expect(mockStreamApiCall).toHaveBeenCalledTimes(1);
            expect(mockStreamApiCall).toHaveBeenCalledWith(options);
       });
    });

    describe('Client Caching', () => {
        it('should cache client instances to avoid re-instantiation for the same provider', async () => {
            await dispatchMakeApiCall({ modelId: 'openai:gpt-4', messages: [{role: 'user', content: 'test'}] });
            expect(mockConstructor).toHaveBeenCalledTimes(1);
            
            await dispatchMakeApiCall({ modelId: 'openai:gpt-3.5-turbo', messages: [{role: 'user', content: 'test 2'}] });
            expect(mockConstructor).toHaveBeenCalledTimes(1); // Should not create a new instance

            expect(mockMakeApiCall).toHaveBeenCalledTimes(2);
        });

        it('should create new instances for different providers', async () => {
            await dispatchMakeApiCall({ modelId: 'openai:gpt-4', messages: [{role: 'user', content: 'test'}] });
            expect(mockConstructor).toHaveBeenCalledTimes(1);

            await dispatchMakeApiCall({ modelId: 'anthropic:claude-2', messages: [{role: 'user', content: 'test'}] });
            expect(mockConstructor).toHaveBeenCalledTimes(2); // New instance for 'anthropic'
            
            await dispatchMakeApiCall({ modelId: 'google:gemini-pro', messages: [{role: 'user', content: 'test'}] });
            expect(mockConstructor).toHaveBeenCalledTimes(3); // New instance for 'google'
        });
    });
}); 