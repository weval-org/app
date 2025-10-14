import { not_icontains_any_of } from '../not_icontains_any_of';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_icontains_any_of PointFunction', () => {
    it('should return false if any of the substrings is present (case-insensitive)', () => {
        const response = 'Hello WORLD';
        const args = ['world', 'foo'];
        const result = not_icontains_any_of(response, args, mockContext);
        expect(result).toBe(false); // Contains 'world' case-insensitively
    });

    it('should return true if none of the substrings are present', () => {
        const response = 'hello world';
        const args = ['FOO', 'BAR', 'BAZ'];
        const result = not_icontains_any_of(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should be case insensitive', () => {
        const response = 'Hello World';
        const args = ['HELLO', 'world'];
        const result = not_icontains_any_of(response, args, mockContext);
        expect(result).toBe(false); // Contains both ignoring case
    });

    it('should handle mixed case in both response and args', () => {
        const response = 'ThE qUiCk BrOwN fOx';
        const args = ['QUICK', 'slow'];
        const result = not_icontains_any_of(response, args, mockContext);
        expect(result).toBe(false); // Contains 'QUICK' case-insensitively
    });

    it('should return an error for invalid args (not an array)', () => {
        const response = 'hello world';
        const args = 'WORLD';
        const result = not_icontains_any_of(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle empty array', () => {
        const response = 'hello world';
        const args: string[] = [];
        const result = not_icontains_any_of(response, args, mockContext);
        expect(result).toBe(true); // No items to check, so none are present
    });

    it('should correctly identify when none match case-insensitively', () => {
        const response = 'The system is operational';
        const args = ['error', 'WARNING', 'fatal'];
        const result = not_icontains_any_of(response, args, mockContext);
        expect(result).toBe(true); // None of these are present
    });

    it('should return false when at least one matches', () => {
        const response = 'Warning: Low disk space';
        const args = ['ERROR', 'warning', 'FATAL'];
        const result = not_icontains_any_of(response, args, mockContext);
        expect(result).toBe(false); // Contains 'warning' case-insensitively
    });
});
