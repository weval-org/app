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

### Direct API Call

```bash
curl -X POST http://localhost:8888/.netlify/functions/factcheck \
  -H "Content-Type: application/json" \
  -d '{
    "claim": "The speed of light is 299,792,458 meters per second"
  }'
```

Response:
```json
{
  "score": 0.98,
  "explain": "## Truth Analysis\nThe claim is demonstrably true...\n\n## Sources Consulted\n- NIST (Very High Trust): Confirms exact value...\n\n**Confidence:** 95/100 | **Accuracy Score:** 98/100"
}
```

### In Blueprints with $call

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
```

## Request Format

```typescript
{
  claim: string;           // Required: The claim to fact-check
  modelId?: string;        // Optional: Override default model
  maxTokens?: number;      // Optional: Max response tokens (default: 2000)
  includeRaw?: boolean;    // Optional: Include raw parsed XML in response
}
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

The endpoint uses `openrouter:google/gemini-2.0-flash-exp:free` by default, which has web search capabilities. You can override this:

```json
{
  "claim": "Your claim here",
  "modelId": "openrouter:google/gemini-2.5-flash:online"
}
```

## Environment Variables

- `FACTCHECK_ENDPOINT_URL` - URL of the fact-check endpoint
  - Local: `http://localhost:8888/.netlify/functions/factcheck`
  - Deployed: `https://your-domain.netlify.app/.netlify/functions/factcheck`

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

1. **Start Netlify Dev:**
   ```bash
   netlify dev
   ```

2. **Set environment variable:**
   ```bash
   export FACTCHECK_ENDPOINT_URL="http://localhost:8888/.netlify/functions/factcheck"
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
  -d '{
    "claim": "Water freezes at 0°C at standard atmospheric pressure",
    "includeRaw": true
  }' | jq .

# False claim - should score low
curl -X POST http://localhost:8888/.netlify/functions/factcheck \
  -H "Content-Type: application/json" \
  -d '{
    "claim": "The Earth is flat"
  }' | jq .

# Partially true claim - should score medium
curl -X POST http://localhost:8888/.netlify/functions/factcheck \
  -H "Content-Type: application/json" \
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
