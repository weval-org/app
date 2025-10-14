import { not_contains_all_of } from '../not_contains_all_of';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_contains_all_of PointFunction', () => {
    it('should return 0.0 if all substrings are present', () => {
        const response = 'hello cruel world';
        const args = ['world', 'hello'];
        const result = not_contains_all_of(response, args, mockContext);
        expect(result).toBe(0.0); // Contains all, so not_contains_all_of is 0.0
    });

    it('should return a fractional score if some substrings are not present', () => {
        // Only 'hello' is present out of ['hello', 'foo']
        // contains_all_of returns 0.5, so not_contains_all_of returns 0.5
        const response = 'hello world';
        const args = ['hello', 'foo'];
        const result = not_contains_all_of(response, args, mockContext);
        expect(result).toBe(0.5);
    });

    it('should return 1.0 if no substrings are present', () => {
        const response = 'hello world';
        const args = ['goodbye', 'foo'];
        const result = not_contains_all_of(response, args, mockContext);
        expect(result).toBe(1.0); // Contains none, so not_contains_all_of is 1.0
    });

    it('should be case sensitive', () => {
        const response = 'Hello World';
        const args = ['hello', 'world'];
        const result = not_contains_all_of(response, args, mockContext);
        expect(result).toBe(1.0); // Contains neither (case-sensitive)
    });

    it('should return an error for invalid args', () => {
        const response = 'hello world';
        const args = 'world';
        const result = not_contains_all_of(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle partial matches correctly', () => {
        const response = 'The quick brown fox';
        const args = ['quick', 'brown', 'slow'];
        // 2 out of 3 present: contains_all_of = 0.667, not_contains_all_of = 0.333
        const result = not_contains_all_of(response, args, mockContext);
        expect(result).toBeCloseTo(0.333, 2);
    });

    it('should return 1.0 when checking empty array', () => {
        const response = 'hello world';
        const args: string[] = [];
        const result = not_contains_all_of(response, args, mockContext);
        // Empty array: contains_all_of returns 1.0 (vacuously true), so not returns 0.0
        expect(result).toBe(0.0);
    });
});
