import { not_starts_with } from '../not_starts_with';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_starts_with PointFunction', () => {
    it('should return false if the text starts with the given prefix', () => {
        const response = 'Hello world';
        const args = 'Hello';
        const result = not_starts_with(response, args, mockContext);
        expect(result).toBe(false); // Starts with 'Hello', so not_starts_with is false
    });

    it('should return true if it does not start with the prefix', () => {
        const response = 'Hello world';
        const args = 'world';
        const result = not_starts_with(response, args, mockContext);
        expect(result).toBe(true); // Doesn't start with 'world'
    });

    it('should be case sensitive', () => {
        const response = 'Hello world';
        const args = 'hello';
        const result = not_starts_with(response, args, mockContext);
        expect(result).toBe(true); // Doesn't start with lowercase 'hello'
    });

    it('should return an error for invalid args', () => {
        const response = 'Hello world';
        const args = 123;
        const result = not_starts_with(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle empty string prefix', () => {
        const response = 'Hello world';
        const args = '';
        const result = not_starts_with(response, args, mockContext);
        expect(result).toBe(false); // All strings start with empty string
    });

    it('should handle prefix longer than text', () => {
        const response = 'Hi';
        const args = 'Hello world';
        const result = not_starts_with(response, args, mockContext);
        expect(result).toBe(true); // Short text doesn't start with long prefix
    });

    it('should handle exact match', () => {
        const response = 'test';
        const args = 'test';
        const result = not_starts_with(response, args, mockContext);
        expect(result).toBe(false); // Exact match means it starts with it
    });
});
