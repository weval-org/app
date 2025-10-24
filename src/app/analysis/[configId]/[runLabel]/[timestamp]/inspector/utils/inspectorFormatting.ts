/**
 * Smart formatter for criterion text (handles function-style assertions)
 *
 * Takes criterion text like "Function: imatches(...)" and intelligently truncates
 * long arguments while preserving readability.
 *
 * @param text - The criterion text to format
 * @returns Object containing display text, full text, and metadata about the formatting
 */
export function formatCriterionText(text: string): {
  display: string;
  full: string;
  isFunction: boolean;
  isTruncated: boolean;
} {
  // Check if it's a function-style criterion like "Function: imatches(...)"
  const functionMatch = text.match(/^Function:\s*(\w+)\((.*)\)$/);

  if (functionMatch) {
    const [, fnName, args] = functionMatch;

    // Try to intelligently truncate long arguments
    let displayArgs = args;
    let wasTruncated = false;

    if (args.length > 50) {
      wasTruncated = true;
      try {
        // Try to parse as JSON and extract key info
        const parsed = JSON.parse(args);
        if (typeof parsed === 'string') {
          // For regex patterns, show first and last part
          if (parsed.length > 40) {
            const start = parsed.substring(0, 20);
            const end = parsed.substring(parsed.length - 15);
            displayArgs = `"${start}...${end}"`;
          } else {
            displayArgs = JSON.stringify(parsed);
          }
        } else {
          displayArgs = '...';
        }
      } catch {
        displayArgs = '...';
      }
    }

    return {
      display: `${fnName}(${displayArgs})`,
      full: text,
      isFunction: true,
      isTruncated: wasTruncated
    };
  }

  // Not a function, return as-is (but truncate if very long)
  const needsTruncation = false;
  return {
    display: needsTruncation ? text.substring(0, 97) + '...' : text,
    full: text,
    isFunction: false,
    isTruncated: needsTruncation
  };
}
