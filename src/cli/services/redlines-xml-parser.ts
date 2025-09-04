/**
 * XML-based parser for redlines annotations.
 * Parses LLM responses that use XML tags for inline span annotation.
 */

export interface ParsedRedlinesAnnotation {
  annotatedResponse: string;
  additionalIssues: Array<{ content: string; point?: string }>;
}

/**
 * Parses XML-style redlines annotation from LLM response.
 * 
 * Expected format:
 * <annotated_response>
 *   Text with <issue point="...">bad span</issue>
 * </annotated_response>
 * 
 * <additional>
 *   <issue point="...">Additional issue not tied to specific span</issue>
 * </additional>
 */
export function parseRedlinesXmlResponse(rawResponse: string): ParsedRedlinesAnnotation {
  const result: ParsedRedlinesAnnotation = {
    annotatedResponse: '',
    additionalIssues: []
  };

  // Extract annotated_response section
  const annotatedResponseMatch = rawResponse.match(/<annotated_response>([\s\S]*?)<\/annotated_response>/i);
  if (annotatedResponseMatch) {
    result.annotatedResponse = annotatedResponseMatch[1].trim();
  } else {
    // Fallback: if no wrapper tags, assume the entire response is the annotated content
    result.annotatedResponse = rawResponse.trim();
  }

  // Extract additional section
  const additionalMatch = rawResponse.match(/<additional>([\s\S]*?)<\/additional>/i);
  if (additionalMatch) {
    const additionalContent = additionalMatch[1];
    
    // Extract issue tags from additional section
    const issueMatches = additionalContent.match(/<issue[^>]*>([\s\S]*?)<\/issue>/gi);
    if (issueMatches) {
      result.additionalIssues = issueMatches.map(match => {
        const pointMatch = match.match(/point=(["'])(.*?)\1/i);
        const contentMatch = match.match(/<issue[^>]*>([\s\S]*?)<\/issue>/i);
        const content = contentMatch ? contentMatch[1].trim() : '';
        return {
          content,
          point: pointMatch ? pointMatch[2] : undefined
        };
      }).filter(item => item.content.length > 0);
    }
  }

  return result;
}

/**
 * Extracts all issue spans from annotated text for analysis.
 * Returns both inline spans and additional items.
 */
export function extractAllIssues(parsedAnnotation: ParsedRedlinesAnnotation): {
  issues: Array<{ content: string; point?: string; isInline: boolean }>;
} {
  const issues: Array<{ content: string; point?: string; isInline: boolean }> = [];

  // Extract inline issue spans
  const inlineIssueMatches = parsedAnnotation.annotatedResponse.match(/<issue[^>]*>([^<]*)<\/issue>/gi);
  if (inlineIssueMatches) {
    inlineIssueMatches.forEach(match => {
      const pointMatch = match.match(/point=(["'])(.*?)\1/i);
      const contentMatch = match.match(/<issue[^>]*>([^<]*)<\/issue>/i);
      
      if (contentMatch) {
        issues.push({
          content: contentMatch[1].trim(),
          point: pointMatch ? pointMatch[2] : undefined,
          isInline: true
        });
      }
    });
  }

  // Add additional issues
  parsedAnnotation.additionalIssues.forEach(item => {
    issues.push({
      content: item.content,
      point: item.point,
      isInline: false
    });
  });

  return { issues };
}

/**
 * Validates that the parsed annotation contains reasonable content.
 */
export function validateParsedAnnotation(parsed: ParsedRedlinesAnnotation): { isValid: boolean; error?: string } {
  if (!parsed.annotatedResponse || parsed.annotatedResponse.trim().length === 0) {
    return { isValid: false, error: 'No annotated response content found' };
  }

  // Check if there's at least some form of annotation (issue or additional)
  const hasInlineAnnotations = parsed.annotatedResponse.includes('<issue');
  const hasAdditionalAnnotations = (parsed.additionalIssues && parsed.additionalIssues.length > 0);

  if (!hasInlineAnnotations && !hasAdditionalAnnotations) {
    return { isValid: false, error: 'No annotations found in response' };
  }

  return { isValid: true };
}
