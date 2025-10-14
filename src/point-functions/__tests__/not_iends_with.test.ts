import { not_iends_with } from '../not_iends_with';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_iends_with PointFunction', () => {
    it('should return false if the text ends with the given suffix (case-insensitive)', () => {
        const response = 'Hello world';
        const args = 'WORLD';
        const result = not_iends_with(response, args, mockContext);
        expect(result).toBe(false); // Ends with 'WORLD' case-insensitively
    });

    it('should return false for lowercase suffix matching uppercase text', () => {
        const response = 'Hello WORLD';
        const args = 'world';
        const result = not_iends_with(response, args, mockContext);
        expect(result).toBe(false);
    });

    it('should return true if it does not end with the suffix', () => {
        const response = 'Hello world';
        const args = 'HELLO';
        const result = not_iends_with(response, args, mockContext);
        expect(result).toBe(true); // Doesn't end with 'HELLO'
    });

    it('should be case insensitive', () => {
        const response = 'HELLO WORLD';
        const args = 'world';
        const result = not_iends_with(response, args, mockContext);
        expect(result).toBe(false); // Ends with 'world' case-insensitively
    });

    it('should return an error for invalid args', () => {
        const response = 'Hello world';
        const args = 123;
        const result = not_iends_with(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle empty string suffix', () => {
        const response = 'Hello world';
        const args = '';
        const result = not_iends_with(response, args, mockContext);
        expect(result).toBe(false); // All strings end with empty string
    });

    it('should handle mixed case', () => {
        const response = 'ThE QuIcK BrOwN FoX';
        const args = 'brown fox';
        const result = not_iends_with(response, args, mockContext);
        expect(result).toBe(false); // Matches case-insensitively
    });
});
