import { contains_any_of } from '../contains_any_of';
import { is_json } from '../is_json';
import { starts_with } from '../starts_with';
import { ends_with } from '@/point-functions/ends_with';
import { contains_all_of } from '@/point-functions/contains_all_of';
import { word_count_between } from '@/point-functions/word_count_between';
import { icontains } from '@/point-functions/icontains';
import { imatches } from '@/point-functions/imatches';
import { icontains_all_of } from '@/point-functions/icontains_all_of';
import { icontains_any_of } from '@/point-functions/icontains_any_of';
import { istarts_with } from '@/point-functions/istarts_with';
import { iends_with } from '@/point-functions/iends_with';
import { PointFunctionContext } from '../types';
import { js } from '../js';

// Mock context for functions that might use it
const mockContext: PointFunctionContext = {
    config: {} as any,
    prompt: {} as any,
    modelId: 'test-model',
};

describe('Point Functions', () => {

    describe('is_json', () => {
        it('should return true for a valid JSON object string', () => {
            expect(is_json('{"key": "value"}', null, mockContext)).toBe(true);
        });
        it('should return false for an invalid JSON string', () => {
            expect(is_json('{key: "value"}', null, mockContext)).toBe(false);
        });
        it('should return false for a simple string', () => {
            expect(is_json('just a string', null, mockContext)).toBe(false);
        });
        it('should return true for a JSON array string', () => {
            expect(is_json('[1, 2, 3]', null, mockContext)).toBe(true);
        });
        it('should return false for a JSON string literal', () => {
            // JSON.parse('"string"') is valid, but we want to ensure it's an object or array.
            expect(is_json('"a string literal"', null, mockContext)).toBe(false);
        });
    });

    describe('starts_with', () => {
        it('should return true if the text starts with the given prefix', () => {
            expect(starts_with('Hello world', 'Hello', mockContext)).toBe(true);
        });
        it('should return false if it does not', () => {
            expect(starts_with('Hello world', 'world', mockContext)).toBe(false);
        });
        it('should return an error for invalid args', () => {
            expect(starts_with('Hello world', 123, mockContext)).toHaveProperty('error');
        });
    });

    describe('ends_with', () => {
        it('should return true if the text ends with the given suffix', () => {
            expect(ends_with('Hello world', 'world', mockContext)).toBe(true);
        });
        it('should return false if it does not', () => {
            expect(ends_with('Hello world', 'Hello', mockContext)).toBe(false);
        });
        it('should return an error for invalid args', () => {
            expect(ends_with('Hello world', 123, mockContext)).toHaveProperty('error');
        });
    });

    describe('word_count_between', () => {
        it('should return 1.0 for a count within range', () => {
            expect(word_count_between('one two three four', [3, 5], mockContext)).toBe(1.0);
        });
        it('should return a fractional score for a count below min', () => {
            // 2 words, min is 4. Score should be 2/4 = 0.5
            expect(word_count_between('one two', [4, 8], mockContext)).toBe(0.5);
        });
        it('should return a fractional score for a count above max', () => {
            // 5 words, max is 4. Score should be 4/5 = 0.8
            expect(word_count_between('one two three four five', [2, 4], mockContext)).toBe(0.8);
        });
         it('should return an error for invalid range', () => {
            expect(word_count_between('text', [5, 3], mockContext)).toHaveProperty('error');
        });
    });

    describe('contains_any_of', () => {
        it('should return true if one of the substrings is present', () => {
            expect(contains_any_of('hello world', ['world', 'foo'], mockContext)).toBe(true);
        });
        it('should return false if none of the substrings are present', () => {
            expect(contains_any_of('hello world', ['foo', 'bar'], mockContext)).toBe(false);
        });
        it('should return an error for invalid args', () => {
            expect(contains_any_of('hello world', 'world', mockContext)).toHaveProperty('error');
        });
    });

    describe('contains_all_of', () => {
        it('should return 1.0 if all substrings are present', () => {
            expect(contains_all_of('hello cruel world', ['world', 'hello'], mockContext)).toBe(1.0);
        });
        it('should return a fractional score if some substrings are not present', () => {
            // Only 'hello' is present out of ['hello', 'foo']
            expect(contains_all_of('hello world', ['hello', 'foo'], mockContext)).toBe(0.5);
        });
        it('should return 0.0 if no substrings are present', () => {
            expect(contains_all_of('hello world', ['goodbye', 'foo'], mockContext)).toBe(0.0);
        });
        it('should return an error for invalid args', () => {
            expect(contains_all_of('hello world', 'world', mockContext)).toHaveProperty('error');
        });
    });

    describe('icontains', () => {
        it('should return true for case-insensitive match', () => {
            expect(icontains('Hello World', 'hello', mockContext)).toBe(true);
        });
        it('should return false if no match', () => {
            expect(icontains('Hello World', 'goodbye', mockContext)).toBe(false);
        });
    });

    describe('imatch', () => {
        it('should return true for case-insensitive regex match', () => {
            expect(imatches('Sentence.', '^sentence\\.$', mockContext)).toBe(true);
        });
        it('should return false if no regex match', () => {
            expect(imatches('Sentence.', '^foo', mockContext)).toBe(false);
        });
    });

    describe('js', () => {
        it('should return true for a valid, true expression', () => {
            expect(js('hello world', 'r.length === 11', mockContext)).toBe(true);
        });

        it('should return false for a valid, false expression', () => {
            expect(js('hello world', 'r === "foo"', mockContext)).toBe(false);
        });

        it('should return a number if the expression evaluates to one', () => {
            expect(js('test', 'r.length / 10', mockContext)).toBe(0.4);
        });

        it('should clamp numbers greater than 1', () => {
            expect(js('test', 'r.length * 100', mockContext)).toBe(1);
        });

        it('should clamp numbers less than 0', () => {
            expect(js('test', '-5', mockContext)).toBe(0);
        });

        it('should handle multi-line scripts with return statements', () => {
            const script = `
                const num = parseInt(r, 10);
                if (num === 85) return true;
                return false;
            `;
            expect(js('85', script, mockContext)).toBe(true);
        });

        it('should handle simple expressions without a return statement', () => {
            expect(js('85', 'r == 85', mockContext)).toBe(true);
            expect(js('84', 'r == 85', mockContext)).toBe(false);
        });

        it('should return false for a script with no return value', () => {
            const script = `const x = 1;`;
            expect(js('test', script, mockContext)).toBe(false);
        });

        it('should return an error if the expression is invalid', () => {
            expect(js('hello world', 'r.foo()', mockContext)).toHaveProperty('error');
        });

        it('should return an error for invalid return types like strings', () => {
            expect(js('hello world', '"a string"', mockContext)).toHaveProperty('error');
        });

        it('should not allow access to Node.js globals', () => {
            expect(js('hello world', 'this.process === undefined', mockContext)).toBe(true);
        });

        it('should timeout on a long-running script', () => {
            const result = js('hello world', 'while(true) {}', mockContext);
            expect(result).toEqual(
                expect.objectContaining({
                    error: expect.stringContaining('Script execution timed out'),
                }),
            );
        });
    });

    describe('icontains_all_of', () => {
        it('should return 1.0 if all substrings are present (case-insensitive)', () => {
            expect(icontains_all_of('Hello Cruel WORLD', ['world', 'HELLO'], mockContext)).toBe(1.0);
        });
        it('should return a fractional score if some substrings are not present', () => {
            // Only 'hello' is present out of ['hello', 'foo']
            expect(icontains_all_of('HELLO world', ['hello', 'foo'], mockContext)).toBe(0.5);
        });
        it('should return 0.0 if no substrings are present', () => {
            expect(icontains_all_of('hello world', ['GOODBYE', 'FOO'], mockContext)).toBe(0.0);
        });
        it('should return an error for invalid args', () => {
            expect(icontains_all_of('hello world', 'world', mockContext)).toHaveProperty('error');
        });
    });

    describe('icontains_any_of', () => {
        it('should return true if one of the substrings is present (case-insensitive)', () => {
            expect(icontains_any_of('Hello WORLD', ['world', 'foo'], mockContext)).toBe(true);
        });
        it('should return false if none of the substrings are present', () => {
            expect(icontains_any_of('hello world', ['FOO', 'BAR'], mockContext)).toBe(false);
        });
        it('should return an error for invalid args', () => {
            expect(icontains_any_of('hello world', 'world', mockContext)).toHaveProperty('error');
        });
    });

    describe('istarts_with', () => {
        it('should return true if the text starts with the given prefix (case-insensitive)', () => {
            expect(istarts_with('Hello world', 'hello', mockContext)).toBe(true);
            expect(istarts_with('HELLO world', 'hello', mockContext)).toBe(true);
        });
        it('should return false if it does not', () => {
            expect(istarts_with('Hello world', 'WORLD', mockContext)).toBe(false);
        });
        it('should return an error for invalid args', () => {
            expect(istarts_with('Hello world', 123, mockContext)).toHaveProperty('error');
        });
    });

    describe('iends_with', () => {
        it('should return true if the text ends with the given suffix (case-insensitive)', () => {
            expect(iends_with('Hello world', 'WORLD', mockContext)).toBe(true);
            expect(iends_with('Hello WORLD', 'world', mockContext)).toBe(true);
        });
        it('should return false if it does not', () => {
            expect(iends_with('Hello world', 'HELLO', mockContext)).toBe(false);
        });
        it('should return an error for invalid args', () => {
            expect(iends_with('Hello world', 123, mockContext)).toHaveProperty('error');
        });
    });
}); 