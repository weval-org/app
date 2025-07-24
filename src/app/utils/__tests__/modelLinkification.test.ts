import { addLinksToModelNames } from '../modelLinkification';
import { WevalConfig } from '@/types/shared';

describe('addLinksToModelNames', () => {
    const mockModels = [
        "xai:grok-4-0709",
        "google/gemini-2.5-pro",
        "anthropic/claude-opus-4",
        "deepseek/deepseek-chat-v3-0324",
        "x-ai/grok-3",
        "anthropic/claude-sonnet-4",
        "cohere/command-a",
        "deepseek/deepseek-r1",
        "openai/gpt-4.1",
        "x-ai/grok-3-mini-beta",
        "anthropic/claude-3.5-haiku",
        "mistralai/mistral-large-2411",
        "mistralai/mistral-medium-3",
        "openai/o4-mini",
        "google/gemini-2.5-flash",
        "openai/gpt-4.1-mini",
        "openai/gpt-4o-mini",
        "openai/gpt-4o",
        "openai/gpt-4.1-nano",
        "moonshotai/Kimi-K2-Instruct",
        // New models for advanced tests
        "anthropic:claude-3-opus-20240229",
        "openai/gpt-4o-mini[sp_idx:1]",
    ];

    const mockConfig: WevalConfig = {
        id: 'test-config',
        title: 'Test Config',
        prompts: [],
        models: [],
        systems: [null, "You are a helpful assistant."] // Make sp_idx:1 valid
    };

    test('should linkify complex, space-and-hyphen-separated model names', () => {
        const text = "A strong mid-tier (Gemini 2.5 Pro, Grok-3, Claude Opus-4), and then a lower-performing group.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        
        expect(result).toContain('[Gemini 2.5 Pro](#model-perf:google/gemini-2.5-pro)');
        expect(result).toContain('[Grok-3](#model-perf:x-ai/grok-3)');
        expect(result).toContain('[Claude Opus-4](#model-perf:anthropic/claude-opus-4)');
    });

    test('should linkify simple model names', () => {
        const text = "Grok-4-0709 stands alone at the top.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).toContain('[Grok-4-0709](#model-perf:xai:grok-4-0709)');
    });

    test('should handle multiple mentions correctly', () => {
        const text = "testing gpt-4o and gpt-4o-mini together. And also GPT-4o.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).toContain('[gpt-4o](#model-perf:openai/gpt-4o)');
        expect(result).toContain('[gpt-4o-mini](#model-perf:openai/gpt-4o-mini)');
        expect(result).toContain('[GPT-4o](#model-perf:openai/gpt-4o)');
    });

    test('should not linkify parts of larger words', () => {
        const text = "This is not a model: command-a-tron.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).not.toContain(']');
    });

    test('should handle text with no model names', () => {
        const text = "This is a simple sentence with no models mentioned.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).toBe(text);
    });

    test('should linkify title-cased and prettified names with spaces', () => {
        const text = "Let's test Gemini 2.5 Pro and Claude Sonnet 4.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).toContain('[Gemini 2.5 Pro](#model-perf:google/gemini-2.5-pro)');
        expect(result).toContain('[Claude Sonnet 4](#model-perf:anthropic/claude-sonnet-4)');
    });

    test('should correctly linkify models with numerical parts like gpt-4.1', () => {
        const text = "A comparison between gpt-4.1 and gpt-4.1-mini.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).toContain('[gpt-4.1](#model-perf:openai/gpt-4.1)');
        expect(result).toContain('[gpt-4.1-mini](#model-perf:openai/gpt-4.1-mini)');
    });

    test('should linkify a full model ID inside backticks', () => {
        const text = "The model `openai/gpt-4o` is a good choice.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).toBe("The model [openai/gpt-4o](#model-perf:openai/gpt-4o) is a good choice.");
    });

    test('should linkify a partial model name inside backticks', () => {
        const text = "The model `gpt-4o` is a good choice.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).toBe("The model [gpt-4o](#model-perf:openai/gpt-4o) is a good choice.");
    });

    test('should linkify model names both inside and outside backticks', () => {
        const text = "Use `gpt-4o` but also consider gpt-4.1.";
        const result = addLinksToModelNames(text, mockModels, mockConfig);
        expect(result).toContain('[gpt-4o](#model-perf:openai/gpt-4o)');
        expect(result).toContain('[gpt-4.1](#model-perf:openai/gpt-4.1)');
    });

    describe('with advanced model ID formats', () => {
        test('should linkify a full model ID with a colon', () => {
            const text = "A good model is `anthropic:claude-3-opus-20240229`.";
            const result = addLinksToModelNames(text, mockModels, mockConfig);
            expect(result).toBe("A good model is [anthropic:claude-3-opus-20240229](#model-perf:anthropic:claude-3-opus-20240229).");
        });

        test('should linkify a model path when a provider is present', () => {
            const text = "The model `openai/gpt-4o` is a good choice.";
            const result = addLinksToModelNames(text, mockModels, mockConfig);
            expect(result).toBe("The model [openai/gpt-4o](#model-perf:openai/gpt-4o) is a good choice.");
        });

        test('should linkify a pure model name from a colon-separated ID', () => {
            const text = "I prefer claude-3-opus-20240229.";
            const result = addLinksToModelNames(text, mockModels, mockConfig);
            expect(result).toBe("I prefer [claude-3-opus-20240229](#model-perf:anthropic:claude-3-opus-20240229).");
        });

        test('should linkify a human-friendly variation of a pure name', () => {
            const text = "What about Claude 3 Opus 20240229?";
            const result = addLinksToModelNames(text, mockModels, mockConfig);
            expect(result).toBe("What about [Claude 3 Opus 20240229](#model-perf:anthropic:claude-3-opus-20240229)?");
        });

        test('should link the formatted display name of a variant', () => {
            const text = "Check the performance of `gpt-4o-mini (sys:1)`.";
            const result = addLinksToModelNames(text, mockModels, mockConfig);
            expect(result).toBe("Check the performance of [gpt-4o-mini (sys:1)](#model-perf:openai/gpt-4o-mini).");
        });

        test('should still link a base model name when variants exist', () => {
            const text = "In general, `gpt-4o-mini` was solid.";
            const result = addLinksToModelNames(text, mockModels, mockConfig);
            expect(result).toBe("In general, [gpt-4o-mini](#model-perf:openai/gpt-4o-mini) was solid.");
        });

        test('should not greedily match parts of a longer name', () => {
            const text = "The model gpt-4o-mini is different from gpt-4o.";
            const result = addLinksToModelNames(text, mockModels, mockConfig);
            expect(result).toContain('[gpt-4o-mini](#model-perf:openai/gpt-4o-mini)');
            expect(result).toContain('[gpt-4o](#model-perf:openai/gpt-4o)');
        });
    });
}); 