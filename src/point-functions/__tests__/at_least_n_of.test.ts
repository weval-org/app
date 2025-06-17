import { contains_at_least_n_of } from '../contains_at_least_n_of';
import { icontains_at_least_n_of } from '../icontains_at_least_n_of';
import { matches_at_least_n_of } from '../matches_at_least_n_of';
import { imatch_at_least_n_of } from '../imatch_at_least_n_of';
import { PointFunctionContext } from '../types';

describe('at_least_n_of functions', () => {
    const mockContext: PointFunctionContext = {
        config: {} as any,
        prompt: {} as any,
        modelId: 'test-model',
    };

    describe('contains_at_least_n_of', () => {
        const text = 'one two three four five';
        it('should return 1.0 when the count is met exactly', () => {
            const result = contains_at_least_n_of(text, [3, ['one', 'two', 'three']], mockContext);
            expect(result).toBe(1.0);
        });
        it('should return 1.0 when the count is exceeded', () => {
            const result = contains_at_least_n_of(text, [2, ['one', 'two', 'three']], mockContext);
            expect(result).toBe(1.0);
        });
        it('should return a partial score when the count is not met', () => {
            const result = contains_at_least_n_of(text, [4, ['one', 'two', 'six']], mockContext);
            expect(result).toBe(0.5); // Found 2, needed 4
        });
        it('should return an error for invalid args', () => {
            const result = contains_at_least_n_of(text, [3, 'one'], mockContext);
            expect(result).toHaveProperty('error');
        });
    });

    describe('icontains_at_least_n_of', () => {
        const text = 'One Two Three Four Five';
        it('should return 1.0 when the count is met case-insensitively', () => {
            const result = icontains_at_least_n_of(text, [3, ['one', 'two', 'THREE']], mockContext);
            expect(result).toBe(1.0);
        });
        it('should return a partial score', () => {
            const result = icontains_at_least_n_of(text, [5, ['one', 'two', 'six', 'SEVEN', 'eight']], mockContext);
            expect(result).toBe(0.4); // Found 2, needed 5
        });
    });

    describe('matches_at_least_n_of', () => {
        const text = 'There are 3 apples and 4 oranges.';
        it('should return 1.0 when the count of regex matches is met', () => {
            const result = matches_at_least_n_of(text, [2, ['\\d+ apples', '\\d+ oranges']], mockContext);
            expect(result).toBe(1.0);
        });
        it('should return a partial score for regex matches', () => {
            const result = matches_at_least_n_of(text, [3, ['apples', 'oranges', 'pears']], mockContext);
            expect(result).toBeCloseTo(0.666); // Found 2, needed 3
        });
    });

    describe('imatch_at_least_n_of', () => {
        const text = 'There are 3 Apples and 4 Oranges.';
        it('should return 1.0 when the count is met case-insensitively', () => {
            const result = imatch_at_least_n_of(text, [2, ['\\d+ apples', '\\d+ oranges']], mockContext);
            expect(result).toBe(1.0);
        });
        it('should return a partial score', () => {
            const result = imatch_at_least_n_of(text, [2, ['\\d+ APPLES', '\\d+ PEARS']], mockContext);
            expect(result).toBe(0.5); // Found 1, needed 2
        });
    });
}); 