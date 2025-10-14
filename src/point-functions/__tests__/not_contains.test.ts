import { not_contains } from '../not_contains';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_contains PointFunction', () => {
    it('should return false if llmResponseText contains the args string', () => {
        const response = 'This is a test response.';
        const args = 'test';
        const result = not_contains(response, args, mockContext);
        expect(result).toBe(false);
    });

    it('should return true if llmResponseText does not contain the args string', () => {
        const response = 'This is a sample response.';
        const args = 'test';
        const result = not_contains(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should be case sensitive', () => {
        const response = 'This is a Test response.';
        const args = 'test';
        const result = not_contains(response, args, mockContext);
        expect(result).toBe(true); // 'Test' is not 'test', so NOT contains is true
    });

    it('should return an error object if args is not a string', () => {
        const response = 'This is a test response.';
        const args = 123 as any;
        const result = not_contains(response, args, mockContext);
        expect(result).toEqual({ error: "Invalid arguments for 'contains'. Expected a string." });
    });

    it('should return false for an empty string arg (empty string is part of any string, so NOT contains is false)', () => {
        const response = 'This is a test response.';
        const args = '';
        const result = not_contains(response, args, mockContext);
        expect(result).toBe(false);
    });

    it('should return true if response is empty and arg is not', () => {
        const response = '';
        const args = 'test';
        const result = not_contains(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should handle special characters', () => {
        const response = 'Price: $100';
        const args = '$50';
        const result = not_contains(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should correctly negate when substring is present', () => {
        const response = 'The quick brown fox';
        const args = 'brown';
        const result = not_contains(response, args, mockContext);
        expect(result).toBe(false); // Contains brown, so not_contains is false
    });
});
