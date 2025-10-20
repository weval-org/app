# Quick Start Guide

## Basic Usage

```bash
# Run with the sample data
pnpm cli author-distance \
  --passages examples/author-passages-sample.json \
  --models "openai:gpt-4o,openai:gpt-4o-mini" \
  --output ./results/author-distance-results.json
```

## Using Different Extractor Models

The default extractor is `openai:gpt-4o-mini`, but you can use other models:

```bash
# Use GPT-4o for better prompt extraction
pnpm cli author-distance \
  --passages examples/author-passages-sample.json \
  --models "openai:gpt-4o,anthropic:claude-3.5-sonnet" \
  --extractor-model "openai:gpt-4o" \
  --output ./results/gpt4o-vs-claude.json

# Use Qwen via OpenRouter (if you have valid model ID)
pnpm cli author-distance \
  --passages examples/author-passages-sample.json \
  --models "openai:gpt-4o,openai:gpt-5" \
  --extractor-model "openrouter:qwen/qwen-2.5-72b-instruct" \
  --output ./results/gpt4o-vs-gpt5.json
```

**Note:** For OpenRouter models, verify the model ID at https://openrouter.ai/models

## Quick Test

For rapid iteration, use a minimal test dataset:

```bash
# Test with just 2 passages and 1 sample
pnpm cli author-distance \
  --passages examples/author-passages-test.json \
  --models "openai:gpt-4o-mini,anthropic:claude-3-5-haiku-20241022" \
  --samples 1 \
  --output /tmp/quick-test.json
```

## Realistic Analysis

For publication-quality results:

```bash
pnpm cli author-distance \
  --passages examples/author-passages-sample.json \
  --models "openai:gpt-4o,openai:gpt-5,anthropic:claude-3.5-sonnet" \
  --samples 5 \
  --temperature 0.7 \
  --embedding-model "openai:text-embedding-3-large" \
  --extractor-model "openai:gpt-4o" \
  --output ./results/full-analysis.json
```

This will:
- Use 7 author passages (Carroll, Hemingway, Woolf, Baldwin, Le Guin, Morrison, Didion)
- Generate 5 samples per prompt to reduce variance
- Use the larger, more accurate embedding model
- Use GPT-4o for higher-quality prompt extraction

**Expected runtime:** ~5-10 minutes (depending on API rate limits)

## Interpreting Results

The key metric is the **closestAuthorPairs** in the interpretation section:

```json
{
  "modelPair": ["openai:gpt-4o", "openai:gpt-5"],
  "distance": 0.123,
  "closestAuthorPair": ["Maya Angelou", "Ernest Hemingway"],
  "authorDistance": 0.125,
  "percentageDifference": 1.8
}
```

This means:
- The embedding distance between GPT-4o and GPT-5 is **0.123**
- This is closest to the distance between Maya Angelou and Ernest Hemingway (**0.125**)
- The difference is only **1.8%**, making this a strong analogy

**Useful rules of thumb:**
- `percentageDifference < 10%`: Very strong analogy
- `percentageDifference < 25%`: Good analogy
- `percentageDifference > 50%`: Weak analogy (consider adding more diverse authors)

## Adding Your Own Passages

Create a JSON file with distinctive author passages:

```json
[
  {
    "author": "Your Author",
    "passage": "A distinctive passage of 100-300 words...",
    "work": "Book Title",
    "rationale": "What makes this passage distinctive",
    "passage_type": "description/dialogue/reflection/etc"
  }
]
```

**Tips for selecting passages:**
- Choose passages that showcase the author's unique voice
- Avoid famous/widely-quoted passages (models may have memorized them)
- Aim for 100-300 words
- Include at least 3-5 authors for meaningful comparisons
- Mix different passage types (descriptions, reflections, dialogue)

## Caching

The tool automatically caches:
- LLM responses (prompt extractions and model responses)
- Embeddings

On subsequent runs with the same data, these will be reused, making analysis much faster.

To force fresh results, clear the cache:

```bash
# Clear LLM response cache
rm -rf .cache/llm-responses/

# Clear embedding cache
rm -rf .cache/embeddings/
```

## Troubleshooting

### "Model not found" errors

Verify model IDs:
- OpenAI: https://platform.openai.com/docs/models
- Anthropic: https://docs.anthropic.com/en/docs/models-overview
- OpenRouter: https://openrouter.ai/models

### Slow performance

- Reduce `--samples` for faster testing (minimum: 1)
- Use smaller models for extraction (e.g., `gpt-4o-mini` instead of `gpt-4o`)
- Use fewer passages in your input file

### Rate limit errors

The tool includes automatic retry logic with exponential backoff. If you still hit limits:
- Reduce concurrency (this requires code changes to `pLimit` values)
- Use different providers for different tasks
- Wait a few minutes between runs
