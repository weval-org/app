import { not_icontains_word } from '../not_icontains_word';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_icontains_word PointFunction', () => {
    it('should return false when word is present (case-insensitive)', () => {
        const response = 'The Paraná River flows through South America';
        expect(not_icontains_word(response, 'paraná', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'PARANÁ', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'PaRaNá', mockContext)).toBe(false);
    });

    it('should return true when word is not present', () => {
        const response = 'The Nile River flows through Africa';
        expect(not_icontains_word(response, 'amazon', mockContext)).toBe(true);
        expect(not_icontains_word(response, 'AMAZON', mockContext)).toBe(true);
    });

    it('should return true when only partial match exists', () => {
        const response = 'Hello world';
        expect(not_icontains_word(response, 'ell', mockContext)).toBe(true);
        expect(not_icontains_word(response, 'ORL', mockContext)).toBe(true);
    });

    it('should handle accented characters case-insensitively', () => {
        const response = 'São Paulo is a city';
        expect(not_icontains_word(response, 'são', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'SÃO', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'rio', mockContext)).toBe(true);
        expect(not_icontains_word(response, 'RIO', mockContext)).toBe(true);
    });

    it('should return true when word is part of larger word', () => {
        const response = 'The Paranáense region';
        expect(not_icontains_word(response, 'paraná', mockContext)).toBe(true);
        expect(not_icontains_word(response, 'PARANÁ', mockContext)).toBe(true);
    });

    it('should handle punctuation boundaries case-insensitively', () => {
        const response = 'Brazil, Paraguay, and Argentina';
        expect(not_icontains_word(response, 'PARAGUAY', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'paraguay', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'uruguay', mockContext)).toBe(true);
        expect(not_icontains_word(response, 'URUGUAY', mockContext)).toBe(true);
    });

    it('should return false for empty string search', () => {
        const response = 'Any text';
        expect(not_icontains_word(response, '', mockContext)).toBe(false);
    });

    it('should return error for invalid args', () => {
        const response = 'Some text';
        const result = not_icontains_word(response, 123, mockContext);
        expect(result).toHaveProperty('error');
    });

    it('should handle special regex characters case-insensitively', () => {
        const response = 'Cost is $100.00 (Dollars)';
        expect(not_icontains_word(response, '$100.00', mockContext)).toBe(false);
        expect(not_icontains_word(response, '$200.00', mockContext)).toBe(true);
        expect(not_icontains_word(response, '(dollars)', mockContext)).toBe(false);
        expect(not_icontains_word(response, '(DOLLARS)', mockContext)).toBe(false);
    });

    it('should handle Cyrillic case-insensitively', () => {
        const response = 'Москва is Moscow';
        expect(not_icontains_word(response, 'москва', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'МОСКВА', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'moscow', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'MOSCOW', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'киев', mockContext)).toBe(true);
    });

    it('should handle mixed case correctly', () => {
        const response = 'The AMAZON River in BRaZiL';
        expect(not_icontains_word(response, 'amazon', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'BRAZIL', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'RiVeR', mockContext)).toBe(false);
        expect(not_icontains_word(response, 'nile', mockContext)).toBe(true);
    });
});
