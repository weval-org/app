import { not_contains_word } from '../not_contains_word';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_contains_word PointFunction', () => {
    it('should return false when word is present', () => {
        const response = 'The Paraná River flows through South America';
        const result = not_contains_word(response, 'Paraná', mockContext);
        expect(result).toBe(false);
    });

    it('should return true when word is not present', () => {
        const response = 'The Nile River flows through Africa';
        const result = not_contains_word(response, 'Amazon', mockContext);
        expect(result).toBe(true);
    });

    it('should return true when only partial match exists', () => {
        const response = 'Hello world';
        expect(not_contains_word(response, 'ell', mockContext)).toBe(true);
        expect(not_contains_word(response, 'orl', mockContext)).toBe(true);
    });

    it('should handle accented characters correctly', () => {
        const response = 'São Paulo is a city';
        expect(not_contains_word(response, 'São', mockContext)).toBe(false);
        expect(not_contains_word(response, 'Rio', mockContext)).toBe(true);
    });

    it('should be case-sensitive', () => {
        const response = 'The Amazon River';
        expect(not_contains_word(response, 'Amazon', mockContext)).toBe(false);
        expect(not_contains_word(response, 'amazon', mockContext)).toBe(true); // Different case
    });

    it('should return true when word is part of larger word', () => {
        const response = 'The Paranáense region';
        expect(not_contains_word(response, 'Paraná', mockContext)).toBe(true);
    });

    it('should handle punctuation boundaries', () => {
        const response = 'Brazil, Paraguay, and Argentina';
        expect(not_contains_word(response, 'Paraguay', mockContext)).toBe(false);
        expect(not_contains_word(response, 'Uruguay', mockContext)).toBe(true);
    });

    it('should return false for empty string search', () => {
        const response = 'Any text';
        expect(not_contains_word(response, '', mockContext)).toBe(false);
    });

    it('should return error for invalid args', () => {
        const response = 'Some text';
        const result = not_contains_word(response, 123, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle special regex characters', () => {
        const response = 'Cost is $100.00 (dollars)';
        expect(not_contains_word(response, '$100.00', mockContext)).toBe(false);
        expect(not_contains_word(response, '$200.00', mockContext)).toBe(true);
    });

    it('should handle Unicode scripts correctly', () => {
        const response = '长江 is the Yangtze River';
        expect(not_contains_word(response, '长江', mockContext)).toBe(false);
        expect(not_contains_word(response, '黄河', mockContext)).toBe(true);
    });
});
