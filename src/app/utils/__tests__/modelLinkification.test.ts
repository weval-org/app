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
        "moonshotai/Kimi-K2-Instruct"
    ];

    const mockConfig: WevalConfig = {
        id: 'test-config',
        title: 'Test Config',
        prompts: [],
        models: [],
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
}); 