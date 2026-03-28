import { NextRequest, NextResponse } from 'next/server';

/**
 * Demo External Evaluator Service
 *
 * This is a simple mock external service that demonstrates the $call point function.
 * It evaluates responses based on configurable criteria and returns a score + explanation.
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

export async function POST(req: NextRequest) {
  try {
    const request: EvaluationRequest = await req.json();

    // Validate required fields
    if (!request.response || typeof request.response !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: "response" field is required and must be a string' },
        { status: 400 }
      );
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

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error in demo-external-evaluator:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}

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
    score: Math.round(score * 100) / 100,
    explain
  };
}
