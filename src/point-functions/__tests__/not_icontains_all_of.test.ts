import { not_icontains_all_of } from '../not_icontains_all_of';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_icontains_all_of PointFunction', () => {
    it('should return 0.0 if all substrings are present (case-insensitive)', () => {
        const response = 'Hello Cruel WORLD';
        const args = ['world', 'HELLO'];
        const result = not_icontains_all_of(response, args, mockContext);
        expect(result).toBe(0.0); // Contains all case-insensitively
    });

    it('should return a fractional score if some substrings are not present', () => {
        // Only 'hello' is present out of ['hello', 'foo']
        const response = 'HELLO world';
        const args = ['hello', 'foo'];
        const result = not_icontains_all_of(response, args, mockContext);
        expect(result).toBe(0.5);
    });

    it('should return 1.0 if no substrings are present', () => {
        const response = 'hello world';
        const args = ['GOODBYE', 'FOO'];
        const result = not_icontains_all_of(response, args, mockContext);
        expect(result).toBe(1.0);
    });

    it('should be case insensitive', () => {
        const response = 'HELLO WORLD';
        const args = ['hello', 'world'];
        const result = not_icontains_all_of(response, args, mockContext);
        expect(result).toBe(0.0); // Contains all case-insensitively
    });

    it('should return an error for invalid args', () => {
        const response = 'hello world';
        const args = 'world';
        const result = not_icontains_all_of(response, args, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle partial matches correctly', () => {
        const response = 'The QUICK brown FOX';
        const args = ['quick', 'BROWN', 'slow'];
        // 2 out of 3 present: icontains_all_of = 0.667, not = 0.333
        const result = not_icontains_all_of(response, args, mockContext);
        expect(result).toBeCloseTo(0.333, 2);
    });

    it('should handle mixed case in response and args', () => {
        const response = 'ThE QuIcK BrOwN FoX';
        const args = ['the', 'QUICK', 'brown', 'FOX'];
        const result = not_icontains_all_of(response, args, mockContext);
        expect(result).toBe(0.0); // All present case-insensitively
    });
});
