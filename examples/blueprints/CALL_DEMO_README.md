# $call Point Function Demo

This directory contains a runnable demonstration of the `$call` point function, which enables external HTTP services to be called during LLM evaluation.

## Overview

The `$call` point function allows you to integrate external services into your evaluation pipeline. This is useful for:

- **Fact-checking**: Verify claims against external knowledge bases
- **Code execution**: Run and test generated code in sandboxes
- **Custom validation**: Use specialized services for domain-specific checks
- **API compliance**: Validate responses against external API standards

## Files

- `call-demo.yml` - Blueprint demonstrating various `$call` use cases
- `../netlify/functions/demo-external-evaluator.ts` - Mock external service endpoint

## Demo External Evaluator

The demo includes a simple Netlify function (`demo-external-evaluator`) that performs quality checks:

**Evaluation Types:**
- `length` - Checks if response meets length constraints
- `keywords` - Verifies required terms are present and forbidden terms absent
- `comprehensive` - Combined length + keyword evaluation

**Request Format:**
```json
{
  "response": "The model's response text",
  "modelId": "openai:gpt-4o-mini",
  "promptId": "test-prompt",
  "checkType": "comprehensive",
  "minLength": 50,
  "maxLength": 500,
  "requiredTerms": ["example", "demo"],
  "forbiddenTerms": ["spam", "inappropriate"]
}
```

**Response Format:**
```json
{
  "score": 0.95,
  "explain": "Response meets all quality criteria"
}
```

## Running the Demo

### Option 1: Local Testing (Recommended)

1. **Start Netlify Dev** (in one terminal):
   ```bash
   netlify dev
   ```
   This starts the local Netlify functions server at `http://localhost:8888`

2. **Set environment variable** (in another terminal):
   ```bash
   export DEMO_EVALUATOR_URL="http://localhost:8888/.netlify/functions/demo-external-evaluator"
   ```

3. **Run the blueprint**:
   ```bash
   pnpm cli run-config examples/blueprints/call-demo.yml
   ```

### Option 2: Using Deployed Endpoint

If you have a deployed Netlify site:

```bash
export DEMO_EVALUATOR_URL="https://your-site.netlify.app/.netlify/functions/demo-external-evaluator"
pnpm cli run-config examples/blueprints/call-demo.yml
```

### Option 3: Quick Test (Manual cURL)

Test the endpoint directly:

```bash
# Start netlify dev first
netlify dev

# In another terminal:
curl -X POST http://localhost:8888/.netlify/functions/demo-external-evaluator \
  -H "Content-Type: application/json" \
  -d '{
    "response": "Photosynthesis is the process by which plants convert sunlight into energy.",
    "checkType": "keywords",
    "requiredTerms": ["photosynthesis", "plants", "sunlight"]
  }'
```

Expected response:
```json
{
  "score": 1.0,
  "explain": "Response contains all required terms and no forbidden terms."
}
```

## Blueprint Examples

The `call-demo.yml` blueprint includes 7 examples:

1. **Length Check** - Validates response length
2. **Keyword Check** - Ensures required terms are present
3. **Comprehensive Check** - Combines length and keyword validation
4. **Inline URL** - Uses inline URL instead of named service
5. **Mixed Evaluation** - Combines intrinsic, interpretive, and extrinsic evaluation
6. **Template Substitution** - Demonstrates `{response}`, `{modelId}`, `{promptId}` templates
7. **Forbidden Terms** - Checks for terms that should NOT appear

## Configuration

### Named Services

Pre-configure services in the blueprint:

```yaml
externalServices:
  my-service:
    url: "${API_ENDPOINT_URL}"
    method: POST
    timeout_ms: 10000
    max_retries: 2
```

Then use in evaluations:

```yaml
- $call:
    service: my-service
    customParam: "value"
    response: "{response}"
```

### Inline URLs

Or use one-off URLs directly:

```yaml
- $call:
    url: "https://api.example.com/validate"
    method: POST
    headers:
      X-API-Key: "${MY_API_KEY}"
    customParam: "value"
    response: "{response}"
```

## Environment Variables

- `DEMO_EVALUATOR_URL` - URL of the demo evaluator endpoint
- Any other `${VAR_NAME}` in your blueprint will be substituted from environment

## Template Substitution

The following templates are automatically replaced in request bodies:

- `{response}` - The model's response text
- `{modelId}` - The model identifier (e.g., "openai:gpt-4o-mini")
- `{promptId}` - The prompt identifier from the blueprint

## Error Handling

The `$call` function handles errors gracefully:

- **Network errors** - Retries with exponential backoff
- **HTTP errors** - Returns error message without crashing evaluation
- **Invalid responses** - Returns validation error
- **Timeouts** - Respects `timeout_ms` configuration

All errors are captured and returned as evaluation results, ensuring the pipeline continues.

## Creating Your Own External Service

To create your own external service:

1. **Implement an HTTP endpoint** that accepts POST requests
2. **Return JSON** in the format: `{score: number, explain?: string}` or `{error: string}`
3. **Handle the standard fields**: `response`, `modelId`, `promptId`
4. **Add custom parameters** as needed for your domain

Example service response:
```json
{
  "score": 0.85,
  "explain": "Response is factually accurate but could include more citations"
}
```

Or for errors:
```json
{
  "error": "Unable to verify claim: external API rate limited"
}
```

## Troubleshooting

**Error: Environment variable DEMO_EVALUATOR_URL is not defined**
- Make sure you've exported the environment variable before running the CLI

**Error: fetch failed**
- Ensure `netlify dev` is running
- Check that the URL is correct (localhost:8888 by default)

**Error: HTTP 404**
- Verify the function name is correct: `demo-external-evaluator`
- Check that the function file exists in `netlify/functions/`

**Slow responses**
- Adjust `timeout_ms` if your service needs more time
- Consider increasing `max_retries` for unreliable networks

## Next Steps

- Modify `demo-external-evaluator.ts` to add custom evaluation logic
- Create your own external service for domain-specific validation
- Integrate with real fact-checking APIs, code execution sandboxes, etc.
- Combine `$call` with other point functions for comprehensive evaluation

## Learn More

- See `src/point-functions/call.ts` for implementation details
- See `src/lib/external-service-utils.ts` for utility functions
- See `examples/blueprints/external-services-demo.yml` for more examples
