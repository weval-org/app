import { not_istarts_with } from '../not_istarts_with';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_istarts_with PointFunction', () => {
    it('should return false if the text starts with the given prefix (case-insensitive)', () => {
        const response = 'Hello world';
        const args = 'hello';
        const result = not_istarts_with(response, args, mockContext);
        expect(result).toBe(false); // Starts with 'hello' case-insensitively
    });

    it('should return false for uppercase prefix matching lowercase text', () => {
        const response = 'hello world';
        const args = 'HELLO';
        const result = not_istarts_with(response, args, mockContext);
        expect(result).toBe(false);
    });

    it('should return true if it does not start with the prefix', () => {
        const response = 'Hello world';
        const args = 'WORLD';
        const result = not_istarts_with(response, args, mockContext);
        expect(result).toBe(true); // Doesn't start with 'WORLD'
    });

    it('should be case insensitive', () => {
        const response = 'HELLO WORLD';
        const args = 'hello';
        const result = not_istarts_with(response, args, mockContext);
        expect(result).toBe(false); // Starts with 'hello' case-insensitively
    });

    it('should return an error for invalid args', () => {
        const response = 'Hello world';
        const args = 123;
        const result = not_istarts_with(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle empty string prefix', () => {
        const response = 'Hello world';
        const args = '';
        const result = not_istarts_with(response, args, mockContext);
        expect(result).toBe(false); // All strings start with empty string
    });

    it('should handle mixed case', () => {
        const response = 'ThE QuIcK BrOwN';
        const args = 'the quick';
        const result = not_istarts_with(response, args, mockContext);
        expect(result).toBe(false); // Matches case-insensitively
    });
});
