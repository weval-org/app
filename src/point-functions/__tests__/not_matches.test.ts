import { not_matches } from '../not_matches';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_matches PointFunction', () => {
    it('should return false if llmResponseText matches the regex string', () => {
        const response = 'The quick brown fox jumps over the lazy dog.';
        const args = 'brown fox';
        const result = not_matches(response, args, mockContext);
        expect(result).toBe(false); // Matches, so not_matches is false
    });

    it('should return true if llmResponseText does not match the regex string', () => {
        const response = 'This is a sample response.';
        const args = '^test$';
        const result = not_matches(response, args, mockContext);
        expect(result).toBe(true); // Doesn't match, so not_matches is true
    });

    it('should handle complex regex patterns', () => {
        const response = 'Contact us at info@example.com';
        const args = '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}';
        const result = not_matches(response, args, mockContext);
        expect(result).toBe(false); // Email pattern matches
    });

    it('should return true when pattern does not match', () => {
        const response = 'No email here';
        const args = '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}';
        const result = not_matches(response, args, mockContext);
        expect(result).toBe(true); // No email pattern
    });

    it('should return an error object if args is not a string', () => {
        const response = 'This is a test response.';
        const args = 123 as any;
        const result = not_matches(response, args, mockContext);
        expect(result).toEqual({ error: "Invalid arguments for 'matches'. Expected a regex string." });
    });

    it('should return an error object if args is an invalid regex pattern', () => {
        const response = 'This is a test response.';
        const args = '['; // Invalid regex
        const result = not_matches(response, args, mockContext);
        expect(result).toHaveProperty('error');
        if (typeof result === 'object' && result !== null && 'error' in result) {
            expect(result.error).toMatch(/^Invalid regex pattern for 'matches':/);
        }
    });

    it('should handle start/end anchors', () => {
        const response = 'test string';
        const args = '^test';
        const result = not_matches(response, args, mockContext);
        expect(result).toBe(false); // Matches start anchor
    });

    it('should return true when anchor does not match', () => {
        const response = 'the test string';
        const args = '^test';
        const result = not_matches(response, args, mockContext);
        expect(result).toBe(true); // Does not start with 'test'
    });
});
