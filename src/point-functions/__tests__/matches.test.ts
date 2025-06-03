import { matches } from '../matches';
import { PointFunctionContext } from '../types';
import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/comparison_v2';

const mockContext: PointFunctionContext = {
    config: {} as ComparisonConfig,
    prompt: {} as CliPromptConfig,
    modelId: 'test-model',
};

describe('matches PointFunction', () => {
    it('should return true if llmResponseText matches the regex string', () => {
        const response = 'The quick brown fox jumps over the lazy dog.';
        const args = 'brown fox'; // Simple substring match
        const result = matches(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should return true for a more complex regex match', () => {
        const response = 'Contact us at info@example.com or support@example.org.';
        const args = '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}'; // Email regex
        const result = matches(response, args, mockContext);
        expect(result).toBe(true);
    });

    it('should return false if llmResponseText does not match the regex string', () => {
        const response = 'This is a sample response.';
        const args = '^test$'; // Exact match for 'test'
        const result = matches(response, args, mockContext);
        expect(result).toBe(false);
    });

    it('should handle regex flags if included in the pattern (though typically passed to RegExp constructor separately)', () => {
        const response = 'test\nTest';
        // Note: Standard RegExp string patterns don't usually embed flags like /pattern/i directly.
        // Instead, flags are a second argument to new RegExp().
        // However, if a user provides such a string, it might behave unexpectedly or error depending on JS version/strictness.
        // For this test, we'll use a simple case-insensitive pattern that works with string arg to new RegExp.
        // A more robust solution would be to allow args to be [pattern, flags] or parse them.
        // For now, assuming args is just the pattern string.
        const args = 'test'; // Will match the first 'test'
        expect(matches(response, args, mockContext)).toBe(true);

        const argsCaseInsensitive = 'Test'; // This will also match if regex engine does simple match
        expect(matches(response, argsCaseInsensitive, mockContext)).toBe(true);
        // To properly test case insensitivity with current `matches` which only takes pattern string:
        const response2 = "CASE INSENSITIVE";
        const args2 = "case insensitive";
        // Standard match will be false. To make it true, user must provide (?i) or similar if supported by JS RegExp string syntax for inline flags
        // or the `matches` function would need to be enhanced to accept flags separately.
        // expect(matches(response2, args2, mockContext)).toBe(false); // This is the expected behavior for non-flagged regex
        // For a truly case-insensitive test with current setup, user needs to supply a regex supporting it.
        const argsWithInlineInsensitiveFlag = '(?i)case insensitive'; // This might not be universally supported or behave as expected in all JS engines when passed as a string to new RegExp()
        // A safer bet for users is to use character classes for simple insensitivity e.g. `[Cc][Aa][Ss][Ee]`
        // Given the spec is "JS-style regex strings that could validly be passed to RegExp(...)", it implies the user handles flags within the pattern string if desired and possible.
        const responseForInsensitive = 'CaSe SeNsItIvE';
        const patternForInsensitive = 'case sensitive'; // No flags, will be false
        expect(matches(responseForInsensitive, patternForInsensitive, mockContext)).toBe(false);
        // If user wants case-insensitivity, they should use regex features for it, e.g. [Cc][Aa][Ss][Ee]
        const patternWithCharClass = '(?i)case sensitive'; // Many engines don't support (?i) in string like this
        // Let's test a common way: character sets
        const insensitivePattern = '[Cc][Aa][Ss][Ee] [Ss][Ee][Nn][Ss][Ii][Tt][Ii][Vv][Ee]';
        expect(matches(responseForInsensitive, insensitivePattern, mockContext)).toBe(true);

    });

    it('should return an error object if args is not a string', () => {
        const response = 'This is a test response.';
        const args = 123 as any;
        const result = matches(response, args, mockContext);
        expect(result).toEqual({ error: "Invalid arguments for 'matches'. Expected a regex string." });
    });

    it('should return an error object if args is an invalid regex pattern', () => {
        const response = 'This is a test response.';
        const args = '['; // Invalid regex
        const result = matches(response, args, mockContext);
        // expect(result).toEqual({ error: "Invalid regex pattern for 'matches': Unterminated character class" });
        // Note: The exact error message for an invalid regex can vary between JavaScript engines.
        // It's safer to check for the presence of `error` and part of the message.
        expect(result).toHaveProperty('error');
        if (typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string') {
            expect(result.error).toMatch(/^Invalid regex pattern for 'matches': .*Unterminated character class/);
        } else {
            // Fail the test if the structure isn't as expected, to ensure the above check runs.
            expect(result).toEqual({
                error: expect.stringMatching(/^Invalid regex pattern for 'matches': .*Unterminated character class/)
            });
        }
    });
}); 