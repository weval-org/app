import { not_imatches } from '../not_imatches';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_imatches PointFunction', () => {
    it('should return false if llmResponseText matches the regex (case-insensitive)', () => {
        const response = 'Sentence.';
        const args = '^sentence\\.$';
        const result = not_imatches(response, args, mockContext);
        expect(result).toBe(false); // Matches case-insensitively
    });

    it('should return true if llmResponseText does not match the regex', () => {
        const response = 'Sentence.';
        const args = '^foo';
        const result = not_imatches(response, args, mockContext);
        expect(result).toBe(true); // Doesn't match
    });

    it('should be case insensitive', () => {
        const response = 'HELLO WORLD';
        const args = 'hello world';
        const result = not_imatches(response, args, mockContext);
        expect(result).toBe(false); // Matches case-insensitively
    });

    it('should handle mixed case patterns and text', () => {
        const response = 'ThE QuIcK bRoWn FoX';
        const args = 'the quick brown fox';
        const result = not_imatches(response, args, mockContext);
        expect(result).toBe(false); // Matches case-insensitively
    });

    it('should return true when pattern does not match (even case-insensitively)', () => {
        const response = 'No match here';
        const args = '^email.*pattern$';
        const result = not_imatches(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should return an error object if args is not a string', () => {
        const response = 'This is a test response.';
        const args = 123 as any;
        const result = not_imatches(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should return an error object if args is an invalid regex pattern', () => {
        const response = 'This is a test response.';
        const args = '['; // Invalid regex
        const result = not_imatches(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle complex patterns case-insensitively', () => {
        const response = 'Contact: INFO@EXAMPLE.COM';
        const args = '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}';
        const result = not_imatches(response, args, mockContext);
        expect(result).toBe(false); // Matches email pattern case-insensitively
    });
});
