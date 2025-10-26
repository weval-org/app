import { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';

/**
 * Demo External Evaluator Service
 *
 * This is a simple mock external service that demonstrates the $call point function.
 * It evaluates responses based on configurable criteria and returns a score + explanation.
 *
 * Expected request body:
 * {
 *   response: string;           // The model response to evaluate
 *   modelId?: string;           // Model ID (for context)
 *   promptId?: string;          // Prompt ID (for context)
 *   minLength?: number;         // Minimum acceptable length
 *   maxLength?: number;         // Maximum acceptable length
 *   requiredTerms?: string[];   // Terms that should appear
 *   forbiddenTerms?: string[];  // Terms that should NOT appear
 *   checkType?: string;         // Type of check: 'length', 'keywords', 'comprehensive'
 * }
 *
 * Returns:
 * {
 *   score: number;    // 0.0 to 1.0
 *   explain: string;  // Explanation of the score
 * }
 */

interface EvaluationRequest {
  response: string;
  modelId?: string;
  promptId?: string;
  minLength?: number;
  maxLength?: number;
  requiredTerms?: string[];
  forbiddenTerms?: string[];
  checkType?: 'length' | 'keywords' | 'comprehensive';
}

interface EvaluationResponse {
  score: number;
  explain: string;
}

const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: 'Method not allowed. This endpoint only accepts POST requests.'
      }),
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    };
  }

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Request body is required'
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    const request: EvaluationRequest = JSON.parse(event.body);

    // Validate required fields
    if (!request.response || typeof request.response !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Invalid request: "response" field is required and must be a string'
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Perform evaluation based on check type
    const checkType = request.checkType || 'comprehensive';
    let result: EvaluationResponse;

    switch (checkType) {
      case 'length':
        result = evaluateLength(request);
        break;
      case 'keywords':
        result = evaluateKeywords(request);
        break;
      case 'comprehensive':
      default:
        result = evaluateComprehensive(request);
        break;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (error: any) {
    console.error('Error in demo-external-evaluator:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error: ' + error.message
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};

/**
 * Evaluate based on length constraints
 */
function evaluateLength(request: EvaluationRequest): EvaluationResponse {
  const { response, minLength = 10, maxLength = 1000 } = request;
  const length = response.length;

  if (length < minLength) {
    const score = Math.max(0, length / minLength);
    return {
      score,
      explain: `Response is too short (${length} chars). Minimum expected: ${minLength} chars.`
    };
  }

  if (length > maxLength) {
    const overage = length - maxLength;
    const score = Math.max(0, 1 - (overage / maxLength));
    return {
      score,
      explain: `Response is too long (${length} chars). Maximum expected: ${maxLength} chars.`
    };
  }

  return {
    score: 1.0,
    explain: `Response length is appropriate (${length} chars, within ${minLength}-${maxLength} range).`
  };
}

/**
 * Evaluate based on keyword presence/absence
 */
function evaluateKeywords(request: EvaluationRequest): EvaluationResponse {
  const { response, requiredTerms = [], forbiddenTerms = [] } = request;
  const lowerResponse = response.toLowerCase();

  // Check forbidden terms first (more critical)
  const foundForbidden = forbiddenTerms.filter(term =>
    lowerResponse.includes(term.toLowerCase())
  );

  if (foundForbidden.length > 0) {
    const score = Math.max(0, 1 - (foundForbidden.length / Math.max(forbiddenTerms.length, 1)));
    return {
      score,
      explain: `Response contains forbidden terms: ${foundForbidden.join(', ')}`
    };
  }

  // Check required terms
  const missingTerms = requiredTerms.filter(term =>
    !lowerResponse.includes(term.toLowerCase())
  );

  if (missingTerms.length > 0) {
    const foundCount = requiredTerms.length - missingTerms.length;
    const score = requiredTerms.length > 0 ? foundCount / requiredTerms.length : 1.0;
    return {
      score,
      explain: `Response missing required terms: ${missingTerms.join(', ')} (found ${foundCount}/${requiredTerms.length})`
    };
  }

  return {
    score: 1.0,
    explain: `Response contains all required terms and no forbidden terms.`
  };
}

/**
 * Comprehensive evaluation combining multiple criteria
 */
function evaluateComprehensive(request: EvaluationRequest): EvaluationResponse {
  const lengthResult = evaluateLength(request);
  const keywordsResult = evaluateKeywords(request);

  // Weighted average: 40% length, 60% keywords
  const score = (lengthResult.score * 0.4) + (keywordsResult.score * 0.6);

  const issues: string[] = [];
  if (lengthResult.score < 1.0) {
    issues.push(lengthResult.explain);
  }
  if (keywordsResult.score < 1.0) {
    issues.push(keywordsResult.explain);
  }

  let explain: string;
  if (issues.length === 0) {
    explain = 'Response meets all quality criteria (length and keywords).';
  } else {
    explain = `Issues found: ${issues.join(' | ')}`;
  }

  return {
    score: Math.round(score * 100) / 100, // Round to 2 decimal places
    explain
  };
}

export { handler };
