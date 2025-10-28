import { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { getModelResponse } from '../../src/cli/services/llm-service';
import { initSentry, captureError, flushSentry } from '../../src/utils/sentry';
import { configure } from '../../src/cli/config';
import { checkBackgroundFunctionAuth } from '../../src/lib/background-function-auth';

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
  messages?: Array<{role: string; content: string; generated?: boolean}>;  // Optional: full conversation context
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

interface FactCheckAttempt {
  attemptNumber: number;
  modelId: string;
  timestamp: string;
  userPrompt: string;
  systemPrompt: string;
  llmResponse?: string;
  error?: string;
  parseSuccess?: boolean;
  parsedData?: any;
}

interface ModelConfig {
  modelId: string;
  maxTokens: number;
  timeout: number;
}

// Configuration for resilient fact-checking
const FACTCHECK_CONFIG = {
  models: [
    {
      modelId: 'openrouter:google/gemini-2.5-flash:online',
      maxTokens: 2000,
      timeout: 60000
    },
    {
      modelId: 'openrouter:qwen/qwen3-vl-30b-a3b-instruct:online',
      maxTokens: 2000,
      timeout: 60000
    }
  ],
  retries: {
    perModel: 2,           // Parse/format failures per model
    network: 1,            // Network/API failures (in getModelResponse)
    backoffMs: 1000       // Initial backoff, doubles each retry
  },
  logging: {
    maxPromptLogLength: 500,
    maxResponseLogLength: 1000
  }
};

// System prompt with trust tiers and structured output format
const SYSTEM_PROMPT = `You are a rigorous fact-checker analyzing AI-generated responses. Use the following heuristics to judge trustworthy online material:

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
You will receive a <CLAIM> to fact-check. The claim may be presented in one of two formats:

1. **Simple Claim:** Just the text to fact-check.
2. **Conversation Format:** A full conversation transcript with <CONVERSATION> structure containing <USER> and <ASSISTANT> messages.

When you receive a conversation:
- **<USER> messages:** Context only. DO NOT fact-check user prompts.
- **<ASSISTANT> messages with "HARD-CODED, DO NOT FACTCHECK":** Pre-supplied example responses for context. DO NOT fact-check these.
- **<ASSISTANT> messages with "PLEASE FACT-CHECK THIS":** AI-generated responses. FACT-CHECK THESE THOROUGHLY.

Focus your fact-checking ONLY on the AI-generated assistant responses (marked "PLEASE FACT-CHECK THIS"). Use the user messages and hardcoded assistant messages purely as context to understand what the AI was responding to.

Optionally, you may also receive an <INSTRUCTION> tag that provides additional focus or guidance on what aspects to prioritize in your analysis. Use this instruction to guide your research and analysis, but still maintain rigorous standards.

**CRITICAL OUTPUT FORMAT REQUIREMENTS:**

You MUST respond with EXACTLY this XML structure. Do NOT include any text before or after these tags. Do NOT use markdown. Do NOT provide conversational responses. ONLY output the XML below:

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

**EXAMPLE OUTPUT:**
<RESOURCE_ANALYSIS>
1. "Climate Change 2021" (IPCC, ipcc.ch) - VERY HIGH TRUST
   - Comprehensive assessment of global warming
   - Key finding: 1.1°C warming since pre-industrial
   - Limitation: Data up to 2020
</RESOURCE_ANALYSIS>

<TRUTH_ANALYSIS>
The claim that global temperatures have risen 1.1°C is strongly supported by IPCC data...
</TRUTH_ANALYSIS>

<CONFIDENCE>
95
</CONFIDENCE>

<SCORE>
92
</SCORE>

**REMEMBER:**
- ALL four XML tags (RESOURCE_ANALYSIS, TRUTH_ANALYSIS, CONFIDENCE, SCORE) are REQUIRED
- CONFIDENCE and SCORE must be integers between 0-100
- Do NOT fabricate sources. If you cannot find relevant information, state this clearly and assign low confidence. It is better to say "insufficient evidence" than to speculate.
- Your entire response should be valid XML with these four tags`;

/**
 * Sanitize user input for XML embedding
 * Wraps content in CDATA to prevent XML parsing issues with special characters
 */
function sanitizeForXML(text: string): string {
  // Escape any existing "]]>" sequences that would break CDATA
  const escaped = text.replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${escaped}]]>`;
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse XML-structured response from LLM
 */
function parseFactCheckResponse(llmResponse: string, modelId: string): {
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

  // Check which tags are missing for better error messages
  const missing: string[] = [];
  if (!resourceMatch) missing.push('RESOURCE_ANALYSIS');
  if (!truthMatch) missing.push('TRUTH_ANALYSIS');
  if (!confidenceMatch) missing.push('CONFIDENCE');
  if (!scoreMatch) missing.push('SCORE');

  if (missing.length > 0) {
    const responseSample = llmResponse.substring(0, 200).replace(/\n/g, ' ');
    throw new Error(
      `Invalid response format from ${modelId}: Missing tags [${missing.join(', ')}]. ` +
      `Response started with: "${responseSample}..."`
    );
  }

  const resourceAnalysis = resourceMatch![1].trim();
  const truthAnalysis = truthMatch![1].trim();
  const confidence = parseInt(confidenceMatch![1], 10);
  const score = parseInt(scoreMatch![1], 10);

  // Validate ranges
  if (isNaN(confidence) || confidence < 0 || confidence > 100) {
    throw new Error(`Invalid confidence score: ${confidenceMatch![1]}`);
  }

  if (isNaN(score) || score < 0 || score > 100) {
    throw new Error(`Invalid accuracy score: ${scoreMatch![1]}`);
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

/**
 * Build the user prompt from request
 */
function buildUserPrompt(request: FactCheckRequest): string {
  let userPrompt = '';

  // Add instruction if provided
  if (request.instruction) {
    userPrompt += `<INSTRUCTION>\n${sanitizeForXML(request.instruction)}\n</INSTRUCTION>\n\n`;
  }

  // Build the claim - either simple text or conversation format
  if (request.messages && request.messages.length > 0) {
    // Multi-turn conversation format
    userPrompt += `<CLAIM>\n  <CONVERSATION>\n`;

    for (const msg of request.messages) {
      if (msg.role === 'user') {
        userPrompt += `    <USER><!-- DO NOT FACTCHECK -->\n${sanitizeForXML(msg.content)}\n    </USER>\n`;
      } else if (msg.role === 'assistant') {
        if (msg.generated) {
          userPrompt += `    <ASSISTANT><!-- PLEASE FACT-CHECK THIS -->\n${sanitizeForXML(msg.content)}\n    </ASSISTANT>\n`;
        } else {
          userPrompt += `    <ASSISTANT><!-- HARD-CODED, DO NOT FACTCHECK -->\n${sanitizeForXML(msg.content)}\n    </ASSISTANT>\n`;
        }
      } else if (msg.role === 'system') {
        userPrompt += `    <SYSTEM><!-- DO NOT FACTCHECK -->\n${sanitizeForXML(msg.content)}\n    </SYSTEM>\n`;
      }
    }

    userPrompt += `  </CONVERSATION>\n</CLAIM>`;
  } else {
    // Simple claim format
    userPrompt += `<CLAIM>\n${sanitizeForXML(request.claim)}\n</CLAIM>`;
  }

  return userPrompt;
}

/**
 * Attempt a single fact-check with a specific model
 */
async function attemptFactCheck(
  config: ModelConfig,
  request: FactCheckRequest,
  userPrompt: string
): Promise<{
  llmResponse: string;
  parsed: {
    resourceAnalysis: string;
    truthAnalysis: string;
    confidence: number;
    score: number;
  };
}> {
  const llmResponse = await getModelResponse({
    modelId: config.modelId,
    systemPrompt: SYSTEM_PROMPT,
    prompt: userPrompt,
    temperature: 0.3,
    maxTokens: config.maxTokens,
    useCache: false,
    timeout: config.timeout,
    retries: FACTCHECK_CONFIG.retries.network
  });

  const parsed = parseFactCheckResponse(llmResponse, config.modelId);

  return { llmResponse, parsed };
}

/**
 * Fact-check with retries and model fallback
 */
async function factCheckWithRetries(
  request: FactCheckRequest
): Promise<FactCheckResponse> {
  const attempts: FactCheckAttempt[] = [];
  const userPrompt = buildUserPrompt(request);

  // Select models to try
  let modelsToTry = FACTCHECK_CONFIG.models;
  if (request.modelId) {
    // User specified a model, only try that one
    modelsToTry = FACTCHECK_CONFIG.models.filter(m => m.modelId === request.modelId);
    if (modelsToTry.length === 0) {
      // Custom model not in our config, use it anyway
      modelsToTry = [{
        modelId: request.modelId,
        maxTokens: request.maxTokens || 2000,
        timeout: 60000
      }];
    }
  }

  // Try each model in sequence
  for (const config of modelsToTry) {
    // Try this model with retries
    for (let attempt = 1; attempt <= FACTCHECK_CONFIG.retries.perModel; attempt++) {
      const attemptNumber = attempts.length + 1;

      try {
        console.log(`[Factcheck] Attempt ${attemptNumber}: ${config.modelId} (retry ${attempt}/${FACTCHECK_CONFIG.retries.perModel})`);

        const result = await attemptFactCheck(config, request, userPrompt);

        // Success! Log and return
        attempts.push({
          attemptNumber,
          modelId: config.modelId,
          timestamp: new Date().toISOString(),
          userPrompt,
          systemPrompt: SYSTEM_PROMPT,
          llmResponse: result.llmResponse,
          parseSuccess: true,
          parsedData: result.parsed
        });

        console.log(
          `[Factcheck] Success on attempt ${attemptNumber} with ${config.modelId} - ` +
          `Score: ${result.parsed.score}, Confidence: ${result.parsed.confidence}`
        );

        // Build and return response
        const response: FactCheckResponse = {
          score: result.parsed.score / 100,
          explain: formatExplanation(result.parsed)
        };

        if (request.includeRaw) {
          response.raw = result.parsed;
        }

        return response;

      } catch (error: any) {
        // Log failed attempt with details
        const errorMessage = error.message || 'Unknown error';

        attempts.push({
          attemptNumber,
          modelId: config.modelId,
          timestamp: new Date().toISOString(),
          userPrompt,
          systemPrompt: SYSTEM_PROMPT,
          error: errorMessage,
          parseSuccess: false
        });

        console.error(
          `[Factcheck] Attempt ${attemptNumber} failed with ${config.modelId}:`,
          errorMessage
        );

        // If this was the last retry for this model, log more details
        if (attempt === FACTCHECK_CONFIG.retries.perModel) {
          console.error(`[Factcheck] All retries exhausted for ${config.modelId}, trying next model if available`);
          break;
        }

        // Wait before retrying (exponential backoff)
        const backoffMs = FACTCHECK_CONFIG.retries.backoffMs * attempt;
        console.log(`[Factcheck] Waiting ${backoffMs}ms before retry...`);
        await sleep(backoffMs);
      }
    }
  }

  // All models and retries failed - prepare comprehensive error
  const uniqueModels = [...new Set(attempts.map(a => a.modelId))];
  const allErrors = attempts.map(a => a.error).filter(Boolean);

  console.error('[Factcheck] All attempts failed:', {
    totalAttempts: attempts.length,
    modelsAttempted: uniqueModels,
    errors: allErrors
  });

  // Log detailed information about each attempt for debugging
  console.error('[Factcheck] Detailed attempt log:');
  attempts.forEach(attempt => {
    console.error(`  - Attempt ${attempt.attemptNumber} (${attempt.modelId}):`, {
      timestamp: attempt.timestamp,
      error: attempt.error,
      parseSuccess: attempt.parseSuccess,
      promptLength: attempt.userPrompt.length,
      promptSample: attempt.userPrompt.substring(0, FACTCHECK_CONFIG.logging.maxPromptLogLength)
    });
  });

  const finalError = new Error(
    `Fact-check failed after ${attempts.length} attempts across ${uniqueModels.length} model(s): ${uniqueModels.join(', ')}`
  );

  // Send comprehensive error to Sentry
  captureError(finalError, {
    endpoint: 'factcheck',
    claim: request.claim.substring(0, 200),
    instruction: request.instruction,
    hasMessages: !!request.messages,
    messageCount: request.messages?.length,
    totalAttempts: attempts.length,
    modelsAttempted: uniqueModels,
    attempts: attempts.map(a => ({
      attemptNumber: a.attemptNumber,
      model: a.modelId,
      timestamp: a.timestamp,
      error: a.error,
      parseSuccess: a.parseSuccess,
      responseSample: a.llmResponse?.substring(0, FACTCHECK_CONFIG.logging.maxResponseLogLength),
      promptSample: a.userPrompt.substring(0, FACTCHECK_CONFIG.logging.maxPromptLogLength)
    }))
  });

  throw finalError;
}

const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // Initialize Sentry
  initSentry('factcheck');

  // Configure CLI (required for llm-service)
  configure({
    errorHandler: (error: Error) => {
      console.error('[Factcheck] Error:', error.message);
    },
    logger: {
      info: (msg: string) => console.log('[Factcheck]', msg),
      warn: (msg: string) => console.warn('[Factcheck]', msg),
      error: (msg: string) => console.error('[Factcheck]', msg),
      success: (msg: string) => console.log('[Factcheck]', msg)
    }
  });

  // Check authentication
  const authError = checkBackgroundFunctionAuth(event);
  if (authError) {
    await flushSentry();
    return authError;
  }

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

    console.log('[Factcheck] Processing claim:', request.claim.substring(0, 100) + '...');
    if (request.instruction) {
      console.log('[Factcheck] Using instruction:', request.instruction);
    }
    if (request.messages) {
      console.log('[Factcheck] Using conversation format with', request.messages.length, 'messages');
    }

    // Perform fact-check with retries and model fallback
    const response = await factCheckWithRetries(request);

    await flushSentry();

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (error: any) {
    console.error('[Factcheck] Handler error:', error.message);

    // factCheckWithRetries already logged details to Sentry if it was a retry failure
    // For other errors (validation, etc), log them here
    if (!error.message?.includes('attempts across')) {
      captureError(error, {
        endpoint: 'factcheck',
        claim: event.body ? JSON.parse(event.body).claim?.substring(0, 100) : undefined
      });
    }

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
