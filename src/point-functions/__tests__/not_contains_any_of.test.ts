import { not_contains_any_of } from '../not_contains_any_of';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_contains_any_of PointFunction', () => {
    it('should return false if any of the substrings is present', () => {
        const response = 'hello world';
        const args = ['world', 'foo'];
        const result = not_contains_any_of(response, args, mockContext);
        expect(result).toBe(false); // Contains 'world', so not_contains_any_of is false
    });

    it('should return true if none of the substrings are present', () => {
        const response = 'hello world';
        const args = ['foo', 'bar', 'baz'];
        const result = not_contains_any_of(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should return false if multiple substrings are present', () => {
        const response = 'hello world and goodbye';
        const args = ['hello', 'goodbye'];
        const result = not_contains_any_of(response, args, mockContext);
        expect(result).toBe(false); // Contains both, so not_contains_any_of is false
    });

    it('should be case sensitive', () => {
        const response = 'Hello World';
        const args = ['hello', 'world'];
        const result = not_contains_any_of(response, args, mockContext);
        expect(result).toBe(true); // Doesn't contain lowercase versions
    });

    it('should return an error for invalid args (not an array)', () => {
        const response = 'hello world';
        const args = 'world';
        const result = not_contains_any_of(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle empty array', () => {
        const response = 'hello world';
        const args: string[] = [];
        const result = not_contains_any_of(response, args, mockContext);
        expect(result).toBe(true); // No items to check, so none are present
    });

    it('should handle array with one matching item', () => {
        const response = 'The error occurred';
        const args = ['error', 'warning', 'fatal'];
        const result = not_contains_any_of(response, args, mockContext);
        expect(result).toBe(false); // Contains 'error'
    });
});
