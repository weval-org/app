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
      '<<error>>'
    ];
    
    // Ensure response is treated as a string for includes check
    const responseStr = String(response);

    return errorPatterns.some(pattern => responseStr.includes(pattern));
  } 