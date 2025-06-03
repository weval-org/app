/**
 * Checks if a response contains common error markers or is empty/whitespace.
 */
export function checkForErrors(response: string): boolean {
    // Check for empty/whitespace response first
    if (!response || response.trim() === '') {
      return true;
    }
    
    // Check for various error indicators
    const errorPatterns = [
      '<error>', // Generic error tags
      '<e>', // Shortened error tags
      'ERROR:', // Error prefix
      'LLM issue', // From getModelResponse service
      'Processing failure', // From embed-multi
      'AUTHENTICATION_FAILED',
      'RATE_LIMIT_EXCEEDED',
      'INVALID_REQUEST',
      'RESOURCE_NOT_FOUND',
      'SERVICE_UNAVAILABLE',
      'NETWORK_ERROR',
      'UNEXPECTED_ERROR'
      // Add any other common error strings observed
    ];
    
    // Ensure response is treated as a string for includes check
    const responseStr = String(response);

    return errorPatterns.some(pattern => responseStr.includes(pattern));
  } 