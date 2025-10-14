import { not_icontains } from '../not_icontains';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/cli_types';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('not_icontains PointFunction', () => {
    it('should return false if llmResponseText contains the args string (case-insensitive)', () => {
        const response = 'This is a TEST response.';
        const args = 'test';
        const result = not_icontains(response, args, mockContext);
        expect(result).toBe(false);
    });

    it('should return true if llmResponseText does not contain the args string', () => {
        const response = 'This is a sample response.';
        const args = 'TEST';
        const result = not_icontains(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should be case insensitive', () => {
        const response = 'This is a Test response.';
        const args = 'TEST';
        const result = not_icontains(response, args, mockContext);
        expect(result).toBe(false); // Contains 'test' ignoring case, so not_icontains is false
    });

    it('should handle mixed case correctly', () => {
        const response = 'HeLLo WoRLd';
        const args = 'hello world';
        const result = not_icontains(response, args, mockContext);
        expect(result).toBe(false); // Contains 'hello world' ignoring case
    });

    it('should return an error object if args is not a string', () => {
        const response = 'This is a test response.';
        const args = 123 as any;
        const result = not_icontains(response, args, mockContext);
        expect(result).toEqual({ error: "Invalid arguments for 'icontains'. Expected a string." });
    });

    it('should return false for an empty string arg (empty string is part of any string)', () => {
        const response = 'This is a test response.';
        const args = '';
        const result = not_icontains(response, args, mockContext);
        expect(result).toBe(false);
    });

    it('should return true if response is empty and arg is not', () => {
        const response = '';
        const args = 'TEST';
        const result = not_icontains(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should handle special characters with case insensitivity', () => {
        const response = 'ERROR: File not found';
        const args = 'error';
        const result = not_icontains(response, args, mockContext);
        expect(result).toBe(false); // Contains 'error' case-insensitively
    });
});
