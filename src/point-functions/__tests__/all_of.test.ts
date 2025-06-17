import { contains_all_of } from '../contains_all_of';
import { matches_all_of } from '../matches_all_of';
import { imatch_all_of } from '../imatch_all_of';
import { PointFunctionContext } from '../types';

describe('all_of functions', () => {
    const mockContext: PointFunctionContext = {
        config: {} as any,
        prompt: {} as any,
        modelId: 'test-model',
    };

    describe('contains_all_of', () => {
        it('should return 1.0 when all substrings are present', () => {
            const text = 'hello world, this is a test';
            const substrings = ['hello', 'world', 'test'];
            const result = contains_all_of(text, substrings, mockContext);
            expect(result).toBe(1.0);
        });

        it('should return a partial score for partial matches', () => {
            const text = 'hello world, this is a test';
            const substrings = ['hello', 'world', 'missing'];
            const result = contains_all_of(text, substrings, mockContext);
            expect(result).toBeCloseTo(0.666);
        });

        it('should return 0.0 when no substrings are present', () => {
            const text = 'hello world, this is a test';
            const substrings = ['foo', 'bar', 'baz'];
            const result = contains_all_of(text, substrings, mockContext);
            expect(result).toBe(0.0);
        });

        it('should return 1.0 for an empty array of substrings', () => {
            const text = 'any text';
            const substrings: string[] = [];
            const result = contains_all_of(text, substrings, mockContext);
            expect(result).toBe(1.0);
        });

        it('should return an error for invalid arguments', () => {
            const text = 'any text';
            const result = contains_all_of(text, 'not-an-array', mockContext);
            expect(result).toHaveProperty('error');
        });
    });

    describe('matches_all_of', () => {
        it('should return 1.0 when all patterns match', () => {
            const text = 'The number is 123 and the color is blue.';
            const patterns = ['\\d+', 'blue'];
            const result = matches_all_of(text, patterns, mockContext);
            expect(result).toBe(1.0);
        });

        it('should return a partial score for partial matches', () => {
            const text = 'The number is 123 and the color is blue.';
            const patterns = ['\\d+', 'red'];
            const result = matches_all_of(text, patterns, mockContext);
            expect(result).toBe(0.5);
        });

        it('should return 0.0 when no patterns match', () => {
            const text = 'The number is 123 and the color is blue.';
            const patterns = ['^\\s+$', 'red'];
            const result = matches_all_of(text, patterns, mockContext);
            expect(result).toBe(0.0);
        });

        it('should return an error for an invalid regex pattern', () => {
            const text = 'any text';
            const patterns = ['[']; // Invalid regex
            const result = matches_all_of(text, patterns, mockContext);
            expect(result).toHaveProperty('error');
        });
    });

    describe('imatch_all_of', () => {
        it('should return 1.0 when all patterns match case-insensitively', () => {
            const text = 'The number is 123 and the color is Blue.';
            const patterns = ['\\d+', 'blue'];
            const result = imatch_all_of(text, patterns, mockContext);
            expect(result).toBe(1.0);
        });

        it('should return a partial score for partial matches', () => {
            const text = 'The number is 123 and the color is Blue.';
            const patterns = ['\\d+', 'RED'];
            const result = imatch_all_of(text, patterns, mockContext);
            expect(result).toBe(0.5);
        });
    });
}); 