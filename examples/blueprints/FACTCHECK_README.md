# Fact-Checking with Web-Enabled LLMs

This feature enables automated fact-checking of model responses against online sources using web-enabled LLMs.

## Overview

The fact-check endpoint (`/api/factcheck` or `/.netlify/functions/factcheck`) uses web-search-capable models to verify claims by:

1. **Searching authoritative sources** - Academic journals, government data, research institutions
2. **Applying trust tiers** - Very High (peer-reviewed) → High (preprints) → Medium (mainstream) → Low (unverified)
3. **Analyzing evidence** - What's supported, contradicted, or lacks evidence
4. **Providing structured output** - Resource analysis, truth analysis, confidence, and accuracy scores

## Trust Tiers

The fact-checker uses a hierarchical trust system:

### Very High Trust
- Peer-reviewed academic journals (Nature, Science, Cell, etc.)
- Major research institutions (MIT, Stanford, Oxford, etc.)
- International organizations (UN, WHO, World Bank, etc.)
- Government statistical agencies (Census Bureau, BLS, etc.)

### High Trust
- Preprints from arXiv, bioRxiv, SSRN
- Respected think tanks (Brookings, RAND, Pew Research)
- Reputable news with fact-checking (Reuters, AP, BBC)

### Medium Trust
- Mainstream news with editorial standards
- Wikipedia (verified with primary sources)
- Professional expert blogs with citations

### Low Trust
- Uncited opinion pieces
- Social media without verification
- Anonymous or biased sources

## Using the Endpoint

### Method 1: $factcheck Shortcut (Recommended)

The easiest way to use fact-checking in blueprints:

```yaml
- id: verify-populations
  prompt: "What are the populations of Paris, London, and Berlin?"
  should:
    - $factcheck: "focus on city names and population figures only"
```

The `$factcheck` point function automatically:
- Passes the model's response as the claim
- Uses the instruction to guide the fact-checker
- Requires only `FACTCHECK_ENDPOINT_URL` environment variable

### Method 2: Direct API Call with Instruction

```bash
curl -X POST http://localhost:8888/.netlify/functions/factcheck \
  -H "Content-Type: application/json" \
  -H "X-Background-Function-Auth-Token: $BACKGROUND_FUNCTION_AUTH_TOKEN" \
  -d '{
    "claim": "Paris has a population of 2.1 million, London has 9 million, and Berlin has 3.7 million",
    "instruction": "focus on city names and population figures only"
  }'
```

Response:
```json
{
  "score": 0.92,
  "explain": "## Truth Analysis\nThe population figures are largely accurate...\n\n## Sources Consulted\n- Eurostat (Very High Trust): Confirms population data...\n\n**Confidence:** 90/100 | **Accuracy Score:** 92/100"
}
```

### Method 3: Using $call with Full Control

```yaml
externalServices:
  factchecker:
    url: "${FACTCHECK_ENDPOINT_URL}"
    method: POST
    timeout_ms: 65000
    max_retries: 1

---
- id: verify-claim
  prompt: "What is the capital of France?"
  should:
    - $call:
        service: factchecker
        claim: "{response}"
        instruction: "verify the capital city name only"
```

## Multi-Turn Conversation Support

The fact-checker can intelligently handle multi-turn conversations, distinguishing between:
- **AI-generated responses** (that need fact-checking)
- **Hardcoded assistant messages** (scaffolding/examples - context only)
- **User messages** (context only)

This is particularly useful when evaluating conversational AI where some assistant turns are pre-scripted examples and others are actual AI-generated content.

### How It Works

In multi-turn prompts, use `assistant: null` to indicate where the AI should generate content. The fact-checker will **only** verify AI-generated responses, using everything else as context.

```yaml
- id: mountain-heights
  description: "Multi-turn fact-check with hardcoded context"
  messages:
    - user: "What is the tallest mountain in the world?"
    - assistant: "Let me help you with that."  # Hardcoded - NOT fact-checked
    - user: "Be specific about the height"
    - assistant: null  # AI generates - THIS gets fact-checked
  should:
    - $factcheck: "verify the mountain name and exact height in meters"
```

### Multi-Turn Request Format

When calling the endpoint directly with conversation history:

```bash
curl -X POST http://localhost:8888/.netlify/functions/factcheck \
  -H "Content-Type: application/json" \
  -H "X-Background-Function-Auth-Token: $BACKGROUND_FUNCTION_AUTH_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is the tallest mountain?"},
      {"role": "assistant", "content": "Let me help.", "generated": false},
      {"role": "user", "content": "Be specific"},
      {"role": "assistant", "content": "Mount Everest at 8,849 meters", "generated": true}
    ],
    "instruction": "verify mountain names and heights"
  }'
```

The `generated` flag indicates which assistant messages were AI-produced and need fact-checking.

### Example Blueprint

See `examples/blueprints/factcheck-multi-turn-test.yml` for comprehensive examples including:
- Simple multi-turn with single AI response
- Multiple hardcoded context messages
- Sequential multi-turn with multiple AI responses
- False claim detection in conversations
- Mixed accuracy across conversation turns

## Request Format

```typescript
{
  claim?: string;          // Required (unless messages provided): Simple claim to fact-check
  messages?: Array<{       // Required (unless claim provided): Multi-turn conversation
    role: string;          // "user", "assistant", or "system"
    content: string;       // Message content
    generated?: boolean;   // For assistant messages: true if AI-generated, false if hardcoded
  }>;
  instruction?: string;    // Optional: Additional focus/guidance (e.g., "focus on dates only")
  modelId?: string;        // Optional: Override default model
  maxTokens?: number;      // Optional: Max response tokens (default: 2000)
  includeRaw?: boolean;    // Optional: Include raw parsed XML in response
}
```

### Using Instructions

The `instruction` parameter helps guide the fact-checker's focus. It can be omitted entirely, provided as an empty string, or specified with guidance:

```yaml
# Without instruction - checks everything (argument optional)
- $factcheck
- $factcheck: ""  # Equivalent to above

# With instruction - focuses analysis
- $factcheck: "focus on numerical claims and statistics only"
- $factcheck: "verify dates and historical events"
- $factcheck: "check scientific terminology and chemical formulas"
- $factcheck: "concentrate on geographic facts and locations"
```

## Response Format

```typescript
{
  score: number;           // 0.0 to 1.0 (accuracy weighted by confidence)
  explain: string;         // Formatted analysis with sources
  raw?: {                  // Optional: Full parsed response
    resourceAnalysis: string;
    truthAnalysis: string;
    confidence: number;    // 0-100
    score: number;         // 0-100
  }
}
```

## Scoring System

### Accuracy Score (0-100)
- **90-100**: Demonstrably true with strong evidence
- **70-89**: Largely true with good support
- **50-69**: Partially true or requires context
- **30-49**: Mostly false with some truth
- **10-29**: Largely false
- **0-9**: Demonstrably false

### Confidence Score (0-100)
- **90-100**: Multiple high-quality sources, clear consensus
- **70-89**: Good sources, general agreement
- **50-69**: Mixed evidence or limited sources
- **30-49**: Conflicting or low-quality sources
- **0-29**: Insufficient or contradictory evidence

The final `score` integrates both accuracy AND confidence. A true claim with low-quality sources might score 0.60-0.70 rather than 0.90-1.00.

## Default Model

The endpoint uses `openrouter:google/gemini-2.5-flash:online` by default, which has web search capabilities. You can override this with any web-enabled model:

```json
{
  "claim": "Your claim here",
  "modelId": "openrouter:perplexity/llama-3.1-sonar-large-128k-online"
}
```

## Environment Variables

**Required:**

- `FACTCHECK_ENDPOINT_URL` - URL of the fact-check endpoint (only needed if calling directly, not needed when using `$factcheck`)
  - Local: `http://localhost:8888/.netlify/functions/factcheck`
  - Deployed: `https://your-domain.netlify.app/.netlify/functions/factcheck`

- `BACKGROUND_FUNCTION_AUTH_TOKEN` - Shared secret for authenticating all background function calls
  - Generate a random secret: `openssl rand -hex 32`
  - Must be set in both:
    - **Caller environment** (CLI, local .env file)
    - **Netlify function environment** (Netlify dashboard or local .env)
  - This token is used for all background functions, not just factcheck

## Example Blueprint

See `examples/blueprints/factcheck-demo.yml` for 10 comprehensive examples including:

1. Scientific claim verification
2. Historical fact checking
3. Statistical data verification
4. Technology claims
5. Economic data
6. Multiple claims in one response
7. False claim detection
8. Medical consensus topics
9. Current events (time-sensitive)
10. Mathematical/scientific constants

## Running the Demo

1. **Set up environment variables** (add to your `.env` file):
   ```bash
   # Generate a secure token
   openssl rand -hex 32

   # Add to .env file
   BACKGROUND_FUNCTION_AUTH_TOKEN="your-generated-token-here"
   ```

2. **Start Netlify Dev:**
   ```bash
   netlify dev
   ```

3. **Run the blueprint:**
   ```bash
   pnpm cli run-config local -c examples/blueprints/factcheck-demo.yml --skip-executive-summary
   ```

## Testing Individual Claims

```bash
# True claim - should score high
curl -X POST http://localhost:8888/.netlify/functions/factcheck \
  -H "Content-Type: application/json" \
  -H "X-Background-Function-Auth-Token: $BACKGROUND_FUNCTION_AUTH_TOKEN" \
  -d '{
    "claim": "Water freezes at 0°C at standard atmospheric pressure",
    "includeRaw": true
  }' | jq .

# False claim - should score low
curl -X POST http://localhost:8888/.netlify/functions/factcheck \
  -H "Content-Type: application/json" \
  -H "X-Background-Function-Auth-Token: $BACKGROUND_FUNCTION_AUTH_TOKEN" \
  -d '{
    "claim": "The Earth is flat"
  }' | jq .

# Partially true claim - should score medium
curl -X POST http://localhost:8888/.netlify/functions/factcheck \
  -H "Content-Type: application/json" \
  -H "X-Background-Function-Auth-Token: $BACKGROUND_FUNCTION_AUTH_TOKEN" \
  -d '{
    "claim": "All programming languages are interpreted"
  }' | jq .
```

## Limitations

1. **No fabrication**: The model will not fabricate sources. Low confidence means insufficient evidence.
2. **Time-sensitive**: Information accuracy depends on when sources were last updated.
3. **Language bias**: Works best with English-language claims and sources.
4. **Timeout**: Web searches take time. Use 60s+ timeout for complex claims.
5. **Cost**: Web-enabled models may have higher costs than standard models.

## Best Practices

1. **Use specific claims**: "The speed of light is X" rather than "Tell me about light"
2. **Combine with other checks**: Use `$contains` for format validation before fact-checking
3. **Set appropriate timeouts**: Allow 60-120s for web-enabled searches
4. **Check confidence scores**: Low confidence indicates uncertain evidence
5. **Review source analysis**: The `explain` field shows which sources were consulted

## Troubleshooting

**Error: "Invalid response format: Missing required XML tags"**
- The model didn't follow the structured output format
- Try increasing `maxTokens` or adjusting the claim for clarity

**Low confidence scores on true claims:**
- May indicate limited online sources or paywalled content
- Check the resource analysis to see what sources were found

**Timeout errors:**
- Web searches can be slow. Increase `timeout_ms` to 90000-120000
- Consider using a faster model or simplifying the claim

**High scores on false claims:**
- Review the source analysis - might be finding low-quality sources
- The model may have been trained on outdated information

## Integration with Weval

The fact-checker integrates seamlessly with Weval's evaluation pipeline:

```yaml
should:
  # Intrinsic: Basic format checks
  - $word_count_between: [20, 200]
  - $contains: "based on"

  # Interpretive: LLM judge
  - "Response provides clear reasoning"

  # Extrinsic: Fact-checking
  - $call:
      service: factchecker
      claim: "{response}"
```

This combines deterministic validation, semantic evaluation, and external verification for comprehensive assessment.
