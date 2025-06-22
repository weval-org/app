import { contains } from '../contains';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig, // Mock as needed for more complex functions
    prompt: {} as CliPromptConfig, // Mock as needed
    modelId: 'test-model',
};

describe('contains PointFunction', () => {
    it('should return true if llmResponseText contains the args string', () => {
        const response = 'This is a test response.';
        const args = 'test';
        const result = contains(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should return false if llmResponseText does not contain the args string', () => {
        const response = 'This is a sample response.';
        const args = 'test';
        const result = contains(response, args, mockContext);
        expect(result).toBe(false);
    });

    it('should be case sensitive', () => {
        const response = 'This is a Test response.';
        const args = 'test';
        const result = contains(response, args, mockContext);
        expect(result).toBe(false); // 'Test' is not 'test'
    });

    it('should return an error object if args is not a string', () => {
        const response = 'This is a test response.';
        const args = 123 as any;
        const result = contains(response, args, mockContext);
        expect(result).toEqual({ error: "Invalid arguments for 'contains'. Expected a string." });
    });

    it('should return true for an empty string arg if response contains it (empty string is part of any string)', () => {
        const response = 'This is a test response.';
        const args = '';
        const result = contains(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should return false if response is empty and arg is not', () => {
        const response = '';
        const args = 'test';
        const result = contains(response, args, mockContext);
        expect(result).toBe(false);
    });
}); 