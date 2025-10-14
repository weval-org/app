import { icontains_word } from '../icontains_word';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('icontains_word PointFunction', () => {
    it('should match complete words case-insensitively', () => {
        const response = 'The Paraná River flows through South America';
        expect(icontains_word(response, 'paraná', mockContext)).toBe(true);
        expect(icontains_word(response, 'PARANÁ', mockContext)).toBe(true);
        expect(icontains_word(response, 'PaRaNá', mockContext)).toBe(true);
    });

    it('should match accented words case-insensitively', () => {
        const response = 'São Paulo is a city';
        expect(icontains_word(response, 'são', mockContext)).toBe(true);
        expect(icontains_word(response, 'SÃO', mockContext)).toBe(true);
        expect(icontains_word(response, 'sÃo', mockContext)).toBe(true);
    });

    it('should match words with various accents case-insensitively', () => {
        const response = 'The café serves Crème Brûlée';
        expect(icontains_word(response, 'CAFÉ', mockContext)).toBe(true);
        expect(icontains_word(response, 'crème', mockContext)).toBe(true);
        expect(icontains_word(response, 'BRÛLÉE', mockContext)).toBe(true);
    });

    it('should not match partial words', () => {
        const response = 'Hello world';
        expect(icontains_word(response, 'ell', mockContext)).toBe(false);
        expect(icontains_word(response, 'ORL', mockContext)).toBe(false);
    });

    it('should match words at boundaries case-insensitively', () => {
        const response = 'Paraná flows south';
        expect(icontains_word(response, 'paraná', mockContext)).toBe(true);

        const response2 = 'The river is Paraná';
        expect(icontains_word(response2, 'PARANÁ', mockContext)).toBe(true);
    });

    it('should match words surrounded by punctuation', () => {
        const response = 'Brazil, Paraguay, and Argentina';
        expect(icontains_word(response, 'PARAGUAY', mockContext)).toBe(true);
        expect(icontains_word(response, 'brazil', mockContext)).toBe(true);
    });

    it('should handle Chinese characters case-insensitively (no case)', () => {
        const response = '长江 is the Yangtze River';
        expect(icontains_word(response, '长江', mockContext)).toBe(true);
        expect(icontains_word(response, 'yangtze', mockContext)).toBe(true);
        expect(icontains_word(response, 'YANGTZE', mockContext)).toBe(true);
    });

    it('should handle Cyrillic case-insensitively', () => {
        const response = 'Москва is Moscow';
        expect(icontains_word(response, 'москва', mockContext)).toBe(true);
        expect(icontains_word(response, 'МОСКВА', mockContext)).toBe(true);
        expect(icontains_word(response, 'moscow', mockContext)).toBe(true);
    });

    it('should return true for empty string', () => {
        const response = 'Any text';
        expect(icontains_word(response, '', mockContext)).toBe(true);
    });

    it('should return false for non-matching word', () => {
        const response = 'The Nile River';
        expect(icontains_word(response, 'amazon', mockContext)).toBe(false);
    });

    it('should return error for invalid args', () => {
        const response = 'Some text';
        const result = icontains_word(response, 123, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle regex special characters case-insensitively', () => {
        const response = 'Cost is $100.00 (Dollars)';
        expect(icontains_word(response, '$100.00', mockContext)).toBe(true);
        expect(icontains_word(response, '(dollars)', mockContext)).toBe(true);
        expect(icontains_word(response, '(DOLLARS)', mockContext)).toBe(true);
    });

    it('should not match when word is part of a larger word', () => {
        const response = 'The Paranáense region';
        expect(icontains_word(response, 'paraná', mockContext)).toBe(false);
    });

    it('should handle mixed case in both text and search term', () => {
        const response = 'The AMAZON River in BRaZiL';
        expect(icontains_word(response, 'amazon', mockContext)).toBe(true);
        expect(icontains_word(response, 'BRAZIL', mockContext)).toBe(true);
        expect(icontains_word(response, 'RiVeR', mockContext)).toBe(true);
    });
});
