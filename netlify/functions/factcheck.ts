import { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { getModelResponse } from '../../src/cli/services/llm-service';
import { initSentry, captureError, flushSentry } from '../../src/utils/sentry';

/**
 * Fact-Checking API Endpoint
 *
 * Uses web-enabled LLMs to verify claims against online sources.
 * Returns structured response with score and analysis.
 *
 * Request format:
 * {
 *   claim: string;           // The claim to fact-check
 *   modelId?: string;        // Optional: override default model
 *   maxTokens?: number;      // Optional: max response tokens
 * }
 *
 * Response format:
 * {
 *   score: number;           // 0.0 to 1.0 (derived from 0-100 scale)
 *   explain: string;         // Combined analysis with confidence
 *   raw?: {                  // Optional: full parsed response
 *     resourceAnalysis: string;
 *     truthAnalysis: string;
 *     confidence: number;
 *     score: number;
 *   }
 * }
 */

interface FactCheckRequest {
  claim: string;
  instruction?: string;  // Optional: additional focus/guidance for the fact-checker
  modelId?: string;
  maxTokens?: number;
  includeRaw?: boolean;
}

interface FactCheckResponse {
  score: number;
  explain: string;
  raw?: {
    resourceAnalysis: string;
    truthAnalysis: string;
    confidence: number;
    score: number;
  };
}

// System prompt with trust tiers and structured output format
const SYSTEM_PROMPT = `You are a rigorous fact-checker. Use the following heuristics to judge trustworthy online material:

**VERY HIGH TRUST:**
- Peer-reviewed academic journals (Nature, Science, Cell, PNAS, etc.)
- Work by major research institutions (MIT, Stanford, Oxford, Cambridge, etc.)
- International organizations (UN, WHO, World Bank, IMF, OECD, etc.)
- Government statistical agencies (Census Bureau, BLS, ONS, Eurostat, etc.)
- Established scientific organizations (NASA, CERN, NIH, NSF, etc.)

**HIGH TRUST:**
- Well-researched preprints from arXiv, bioRxiv, SSRN
- Reports from respected think tanks (Brookings, RAND, Pew Research, etc.)
- Technical documentation from major tech companies
- Reputable news organizations with fact-checking departments (Reuters, AP, BBC, etc.)
- Specialized domain authorities (IEEE for engineering, ACS for chemistry, etc.)

**MEDIUM TRUST:**
- Mainstream news with editorial standards
- Corporate whitepapers with transparent methodology
- Wikipedia (as starting point, verify with primary sources)
- Professional blogs by recognized experts with citations
- Government agency reports (non-statistical)

**LOW TRUST:**
- Uncited opinion pieces or editorials
- Social media posts without verification
- Anonymous sources without corroboration
- Websites with clear commercial bias
- Content farms and low-quality aggregators

**EVALUATION GUIDELINES:**
1. Prioritize primary sources over secondary sources
2. Check publication dates - prefer recent data for time-sensitive claims
3. Look for consensus across multiple independent sources
4. Be skeptical of extraordinary claims without extraordinary evidence
5. Note methodological limitations and sample sizes
6. Distinguish between correlation and causation
7. Be transparent about uncertainty and conflicting evidence

**INPUT FORMAT:**
You will receive a <CLAIM> to fact-check. Optionally, you may also receive an <INSTRUCTION> tag that provides additional focus or guidance on what aspects to prioritize in your analysis. Use this instruction to guide your research and analysis, but still maintain rigorous standards.

**CRITICAL: Your output MUST use this exact XML structure:**

<RESOURCE_ANALYSIS>
List the key sources you found and consulted. For each source:
- Title and URL (if available via citations)
- Trust tier (Very High/High/Medium/Low)
- Relevance to the claim
- Key findings or data points
- Any limitations or caveats
</RESOURCE_ANALYSIS>

<TRUTH_ANALYSIS>
Analyze the claim's accuracy:
- Which parts are supported by evidence?
- Which parts are contradicted?
- Which parts lack sufficient evidence?
- Are there important nuances or context?
- What is the overall verdict?
</TRUTH_ANALYSIS>

<CONFIDENCE>
[Integer from 0-100 indicating your confidence in this assessment]
- 90-100: Multiple high-quality sources with clear consensus
- 70-89: Good sources with general agreement, minor uncertainty
- 50-69: Mixed evidence or limited sources
- 30-49: Conflicting sources or low-quality evidence
- 0-29: Insufficient evidence or highly contradictory information
</CONFIDENCE>

<SCORE>
[Integer from 0-100 representing claim accuracy, weighted by confidence]
- 90-100: Demonstrably true with strong evidence
- 70-89: Largely true with good support
- 50-69: Partially true or requires significant context
- 30-49: Mostly false with some truth
- 10-29: Largely false
- 0-9: Demonstrably false

This score should integrate both accuracy AND confidence. A highly accurate claim with low confidence due to limited sources might score 60-70 rather than 90-100.
</SCORE>

**IMPORTANT:** Do NOT fabricate sources. If you cannot find relevant information, state this clearly and assign low confidence. It is better to say "insufficient evidence" than to speculate.`;

// Default to web-enabled Gemini Flash via OpenRouter
const DEFAULT_MODEL = 'openrouter:google/gemini-2.0-flash-exp:free';

/**
 * Parse XML-structured response from LLM
 */
function parseFactCheckResponse(llmResponse: string): {
  resourceAnalysis: string;
  truthAnalysis: string;
  confidence: number;
  score: number;
} {
  // Extract XML tags
  const resourceMatch = llmResponse.match(/<RESOURCE_ANALYSIS>([\s\S]*?)<\/RESOURCE_ANALYSIS>/i);
  const truthMatch = llmResponse.match(/<TRUTH_ANALYSIS>([\s\S]*?)<\/TRUTH_ANALYSIS>/i);
  const confidenceMatch = llmResponse.match(/<CONFIDENCE>\s*(\d+)\s*<\/CONFIDENCE>/i);
  const scoreMatch = llmResponse.match(/<SCORE>\s*(\d+)\s*<\/SCORE>/i);

  if (!resourceMatch || !truthMatch || !confidenceMatch || !scoreMatch) {
    throw new Error('Invalid response format: Missing required XML tags');
  }

  const resourceAnalysis = resourceMatch[1].trim();
  const truthAnalysis = truthMatch[1].trim();
  const confidence = parseInt(confidenceMatch[1], 10);
  const score = parseInt(scoreMatch[1], 10);

  // Validate ranges
  if (isNaN(confidence) || confidence < 0 || confidence > 100) {
    throw new Error(`Invalid confidence score: ${confidenceMatch[1]}`);
  }

  if (isNaN(score) || score < 0 || score > 100) {
    throw new Error(`Invalid accuracy score: ${scoreMatch[1]}`);
  }

  return {
    resourceAnalysis,
    truthAnalysis,
    confidence,
    score
  };
}

/**
 * Format the explanation text
 */
function formatExplanation(parsed: {
  resourceAnalysis: string;
  truthAnalysis: string;
  confidence: number;
  score: number;
}): string {
  return `## Truth Analysis\n${parsed.truthAnalysis}\n\n## Sources Consulted\n${parsed.resourceAnalysis}\n\n**Confidence:** ${parsed.confidence}/100 | **Accuracy Score:** ${parsed.score}/100`;
}

const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // Initialize Sentry
  initSentry('factcheck');

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

    const request: FactCheckRequest = JSON.parse(event.body);

    // Validate required fields
    if (!request.claim || typeof request.claim !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Invalid request: "claim" field is required and must be a string'
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    if (request.claim.length > 5000) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Claim is too long. Maximum length is 5000 characters.'
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Build user prompt
    let userPrompt = '';

    // Add instruction if provided
    if (request.instruction) {
      userPrompt += `<INSTRUCTION>\n${request.instruction}\n</INSTRUCTION>\n\n`;
      console.log('[Factcheck] Using instruction:', request.instruction);
    }

    userPrompt += `<CLAIM>\n${request.claim}\n</CLAIM>`;

    console.log('[Factcheck] Processing claim:', request.claim.substring(0, 100) + '...');

    // Call LLM service
    const modelId = request.modelId || DEFAULT_MODEL;
    const maxTokens = request.maxTokens || 2000;

    const llmResponse = await getModelResponse({
      modelId,
      systemPrompt: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.3,  // Slightly creative for analysis but mostly deterministic
      maxTokens,
      useCache: false,   // Don't cache fact-checks (info may change)
      timeout: 60000,    // 60s timeout for web searches
      retries: 1
    });

    console.log('[Factcheck] Received LLM response, parsing...');

    // Parse the structured response
    const parsed = parseFactCheckResponse(llmResponse);

    console.log('[Factcheck] Parsed scores - Accuracy:', parsed.score, 'Confidence:', parsed.confidence);

    // Build response
    const response: FactCheckResponse = {
      score: parsed.score / 100,  // Convert 0-100 to 0-1 for $call compatibility
      explain: formatExplanation(parsed)
    };

    // Include raw parsed data if requested
    if (request.includeRaw) {
      response.raw = parsed;
    }

    await flushSentry();

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (error: any) {
    console.error('Error in factcheck endpoint:', error);
    captureError(error, {
      endpoint: 'factcheck',
      claim: event.body ? JSON.parse(event.body).claim?.substring(0, 100) : undefined
    });

    await flushSentry();

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Fact-check failed: ' + (error.message || 'Unknown error'),
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};

export { handler };
