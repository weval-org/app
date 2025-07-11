import { BaseLLMClient } from '../llm-clients/types';

// This is a generic mock client class.
// We can spy on its constructor and methods to test the dispatcher's behavior.
const mockMakeApiCall = jest.fn();
const mockStreamApiCall = jest.fn();
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


describe('LLM Client Dispatcher', () => {
    let dispatchMakeApiCall: any;
    let dispatchStreamApiCall: any;

    beforeEach(() => {
        // Resetting modules is crucial to clear the internal `clientInstances` cache in the dispatcher
        jest.resetModules();
        
        // Re-import the dispatcher to get a fresh instance with an empty cache
        const dispatcher = require('../llm-clients/client-dispatcher');
        dispatchMakeApiCall = dispatcher.dispatchMakeApiCall;
        dispatchStreamApiCall = dispatcher.dispatchStreamApiCall;

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
                'Invalid modelId format: "invalid-id". Expected format: "<provider>:<model-name>"'
            );
        });

        it('should throw an error for an invalid modelId format (multiple colons)', async () => {
            const options = { modelId: 'provider:model:extra', messages: [{role: 'user', content: 'test'}] };
            await expect(dispatchMakeApiCall(options)).rejects.toThrow(
                'Invalid modelId format: "provider:model:extra". Expected format: "<provider>:<model-name>"'
            );
        });

        it('should throw an error for an unsupported provider', async () => {
            const options = { modelId: 'unsupported:some-model', messages: [{role: 'user', content: 'test'}] };
            await expect(dispatchMakeApiCall(options)).rejects.toThrow(
                'Unsupported LLM provider: "unsupported" from model ID "unsupported:some-model".'
            );
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