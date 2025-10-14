import { contains_word } from '../contains_word';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('contains_word PointFunction', () => {
    it('should match complete words with Unicode-aware boundaries', () => {
        const response = 'The Paraná River flows through South America';
        const result = contains_word(response, 'Paraná', mockContext);
        expect(result).toBe(true);
    });

    it('should match words with various accented characters', () => {
        const response = 'São Paulo is a city in Brazil';
        const result = contains_word(response, 'São', mockContext);
        expect(result).toBe(true);
    });

    it('should match words with multiple accents', () => {
        const response = 'The café serves crème brûlée';
        expect(contains_word(response, 'café', mockContext)).toBe(true);
        expect(contains_word(response, 'crème', mockContext)).toBe(true);
        expect(contains_word(response, 'brûlée', mockContext)).toBe(true);
    });

    it('should not match partial words', () => {
        const response = 'Hello world';
        expect(contains_word(response, 'ell', mockContext)).toBe(false);
        expect(contains_word(response, 'orl', mockContext)).toBe(false);
    });

    it('should match words at the start of string', () => {
        const response = 'Paraná flows south';
        const result = contains_word(response, 'Paraná', mockContext);
        expect(result).toBe(true);
    });

    it('should match words at the end of string', () => {
        const response = 'The river is Paraná';
        const result = contains_word(response, 'Paraná', mockContext);
        expect(result).toBe(true);
    });

    it('should match words surrounded by punctuation', () => {
        const response = 'Brazil, Paraguay, and Argentina';
        expect(contains_word(response, 'Paraguay', mockContext)).toBe(true);

        const response2 = 'The Paraná—a major river—flows south';
        expect(contains_word(response2, 'Paraná', mockContext)).toBe(true);
    });

    it('should be case-sensitive', () => {
        const response = 'The Amazon River';
        expect(contains_word(response, 'Amazon', mockContext)).toBe(true);
        expect(contains_word(response, 'amazon', mockContext)).toBe(false);
    });

    it('should handle words with hyphens correctly', () => {
        const response = 'This is a well-known fact';
        // Hyphen is not a word character, so "well" and "known" are separate words
        expect(contains_word(response, 'well', mockContext)).toBe(true);
        expect(contains_word(response, 'known', mockContext)).toBe(true);
        // But "well-known" as a phrase should match because we're looking for the complete phrase
        expect(contains_word(response, 'well-known', mockContext)).toBe(true);
    });

    it('should handle Chinese and other non-Latin scripts', () => {
        const response = '长江 is the Yangtze River';
        expect(contains_word(response, '长江', mockContext)).toBe(true);
        expect(contains_word(response, 'Yangtze', mockContext)).toBe(true);
    });

    it('should handle Arabic script', () => {
        const response = 'النيل is the Nile in Arabic';
        expect(contains_word(response, 'النيل', mockContext)).toBe(true);
    });

    it('should handle Cyrillic script', () => {
        const response = 'Москва is Moscow in Russian';
        expect(contains_word(response, 'Москва', mockContext)).toBe(true);
    });

    it('should match words with underscores as part of the word', () => {
        const response = 'The variable_name is defined';
        expect(contains_word(response, 'variable_name', mockContext)).toBe(true);
        expect(contains_word(response, 'variable', mockContext)).toBe(false); // underscore extends the word
    });

    it('should return true for empty string (vacuous truth)', () => {
        const response = 'Any text';
        const result = contains_word(response, '', mockContext);
        expect(result).toBe(true);
    });

    it('should return false for non-matching word', () => {
        const response = 'The Nile River';
        const result = contains_word(response, 'Amazon', mockContext);
        expect(result).toBe(false);
    });

    it('should return error for invalid args (not a string)', () => {
        const response = 'Some text';
        const result = contains_word(response, 123, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle regex special characters in the search term', () => {
        const response = 'Cost is $100.00 (dollars)';
        expect(contains_word(response, '$100.00', mockContext)).toBe(true);
        expect(contains_word(response, '(dollars)', mockContext)).toBe(true);
    });

    it('should not match when word is part of a larger word', () => {
        const response = 'The Paranáense region';
        // "Paraná" is part of "Paranáense" - should not match
        expect(contains_word(response, 'Paraná', mockContext)).toBe(false);
    });

    it('should handle words followed by apostrophes correctly', () => {
        const response = "It's a beautiful day";
        // Apostrophe is not a word character
        expect(contains_word(response, 'It', mockContext)).toBe(true);
    });
});
