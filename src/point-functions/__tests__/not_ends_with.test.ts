import { not_ends_with } from '../not_ends_with';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_ends_with PointFunction', () => {
    it('should return false if the text ends with the given suffix', () => {
        const response = 'Hello world';
        const args = 'world';
        const result = not_ends_with(response, args, mockContext);
        expect(result).toBe(false); // Ends with 'world', so not_ends_with is false
    });

    it('should return true if it does not end with the suffix', () => {
        const response = 'Hello world';
        const args = 'Hello';
        const result = not_ends_with(response, args, mockContext);
        expect(result).toBe(true); // Doesn't end with 'Hello'
    });

    it('should be case sensitive', () => {
        const response = 'Hello world';
        const args = 'World';
        const result = not_ends_with(response, args, mockContext);
        expect(result).toBe(true); // Doesn't end with 'World' (capital W)
    });

    it('should return an error for invalid args', () => {
        const response = 'Hello world';
        const args = 123;
        const result = not_ends_with(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle empty string suffix', () => {
        const response = 'Hello world';
        const args = '';
        const result = not_ends_with(response, args, mockContext);
        expect(result).toBe(false); // All strings end with empty string
    });

    it('should handle suffix longer than text', () => {
        const response = 'Hi';
        const args = 'Hello world';
        const result = not_ends_with(response, args, mockContext);
        expect(result).toBe(true); // Short text doesn't end with long suffix
    });

    it('should handle exact match', () => {
        const response = 'test';
        const args = 'test';
        const result = not_ends_with(response, args, mockContext);
        expect(result).toBe(false); // Exact match means it ends with it
    });

    it('should handle punctuation at end', () => {
        const response = 'This is a sentence.';
        const args = '.';
        const result = not_ends_with(response, args, mockContext);
        expect(result).toBe(false); // Ends with period
    });
});
