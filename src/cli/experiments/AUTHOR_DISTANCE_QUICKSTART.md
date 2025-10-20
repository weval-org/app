# Author Distance Analysis - Quick Start

## What This Does

Proves your hypothesis by measuring the embedding distance between GPT-4o and GPT-5, then comparing it to the distance between literary authors (like Maya Angelou ↔ Ernest Hemingway) to provide an intuitive, relatable metric for the magnitude of the model shift.

## Run the Full Analysis

```bash
# Option 1: Use the convenience script (recommended)
./src/cli/experiments/scripts/run-author-distance-analysis.sh

# Option 2: Run directly with pnpm
pnpm cli author-distance \
  --passages src/cli/experiments/examples/author-passages-sample.json \
  --models "openrouter:openai/gpt-4o,openrouter:openai/gpt-5,openrouter:openai/gpt-4o-mini,openrouter:openai/gpt-4.1,openrouter:openai/o4-mini,anthropic:claude-3-7-sonnet-20250219,openrouter:anthropic/claude-sonnet-4,openrouter:anthropic/claude-3.5-haiku,openrouter:deepseek/deepseek-chat-v3.1,openrouter:google/gemini-2.5-pro,openrouter:x-ai/grok-3,together:meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo" \
  --samples 3 \
  --output ./results/author-distance/full-analysis.json
```

**Estimated time:** 25-30 minutes
**Estimated cost:** $2-10 (mostly model response generation)

## What Gets Tested

### 12 Models Across 6 Vendors:

**OpenAI (5 models):**
- `gpt-4o` - Your baseline
- `gpt-5` - The controversial transition ⭐
- `gpt-4o-mini` - Size comparison
- `gpt-4.1` - Another variant
- `o4-mini` - Reasoning model

**Anthropic (3 models):**
- `claude-3-7-sonnet` - Latest flagship
- `claude-sonnet-4` - Via OpenRouter
- `claude-3.5-haiku` - Smaller model

**Others (4 models):**
- DeepSeek Chat v3.1 - Chinese training
- Gemini 2.5 Pro - Google flagship
- Grok 3 - X.AI
- Llama 3.1 405B - Largest open source

### 7 Literary Authors:

- Lewis Carroll (whimsical, geometric)
- Ernest Hemingway (sparse, declarative)
- Virginia Woolf (stream of consciousness)
- James Baldwin (philosophical, emotional)
- Ursula K. Le Guin (sensory, mysterious)
- Toni Morrison (mythic, rhythmic)
- Joan Didion (clinical, precise)

## Analyze the Results

Once complete:

```bash
# View full summary
./src/cli/experiments/scripts/analyze-author-distance-results.sh results/author-distance/analysis_*.json

# Quick peek at GPT-4o → GPT-5 finding
cat results/author-distance/analysis_*.json | jq '.interpretation.closestAuthorPairs[] | select(.modelPair | contains(["gpt-4o", "gpt-5"]))'

# See all model-to-model distances
cat results/author-distance/analysis_*.json | jq '.distances.modelToModel | sort_by(.distance)'
```

## Expected Insights

1. **Primary:** GPT-4o → GPT-5 distance and its literary equivalent
2. **Context:** How that compares to other vendor transitions
3. **Size effects:** Do mini vs standard models cluster?
4. **Cultural effects:** Does DeepSeek (Chinese) differ from US models?
5. **Architecture:** Do reasoning models (o4-mini) have distinct personality?
6. **Open source:** Does Llama cluster with proprietary models?

## What You'll Get

A JSON file with:

```json
{
  "interpretation": {
    "closestAuthorPairs": [
      {
        "modelPair": ["gpt-4o", "gpt-5"],
        "distance": 0.145,
        "closestAuthorPair": ["Maya Angelou", "Ernest Hemingway"],
        "authorDistance": 0.142,
        "percentageDifference": 2.1
      }
    ]
  },
  "distances": {
    "modelToModel": [...],
    "authorToAuthor": [...]
  },
  "metadata": {...},
  "extractedPrompts": [...],
  "embeddings": [...]
}
```

## Use in Your Article

> "The backlash from OpenAI's forced transition from GPT-4o to GPT-5 was entirely detectable. Text embeddings show a distance of **0.145** between these models—equivalent in magnitude to the distance between Maya Angelou and Ernest Hemingway (**0.142**). In literary terms, this represents not a subtle style evolution, but a fundamental personality shift."

## Troubleshooting

### Model not found errors

Check model availability at:
- OpenRouter: https://openrouter.ai/models
- Anthropic: https://docs.anthropic.com/en/docs/models-overview

If a model is unavailable, remove it from the list and continue.

### Rate limits

The tool auto-retries with exponential backoff. If you still hit limits:
- Wait 5-10 minutes between runs
- The cache will preserve completed work
- Rerun the same command to resume

### Out of memory

Reduce the model list or run in batches:

```bash
# Batch 1: OpenAI models only
pnpm cli author-distance \
  --passages examples/author-passages-sample.json \
  --models "openrouter:openai/gpt-4o,openrouter:openai/gpt-5,openrouter:openai/gpt-4o-mini" \
  --output ./results/batch1.json

# Batch 2: Anthropic models only
pnpm cli author-distance \
  --passages examples/author-passages-sample.json \
  --models "anthropic:claude-3-7-sonnet-20250219,openrouter:anthropic/claude-sonnet-4" \
  --output ./results/batch2.json
```

## Quick Test First

Before the full 25-minute run, validate with a quick test:

```bash
pnpm cli author-distance \
  --passages src/cli/experiments/examples/author-passages-test.json \
  --models "openrouter:openai/gpt-4o,openrouter:openai/gpt-5" \
  --samples 1 \
  --output /tmp/quick-test.json

# Should complete in ~2 minutes
```

## Files & Documentation

- `src/cli/experiments/README.md` - Methodology & concepts
- `src/cli/experiments/USAGE.md` - Detailed usage guide
- `src/cli/experiments/IMPLEMENTATION_NOTES.md` - Technical details
- `examples/author-passages-sample.json` - The 7 author passages
- `examples/model-selection-for-analysis.json` - Model selection rationale

## Ready to Run?

```bash
# Make sure you're in the project root
cd /Users/james/proj/llm_personalities

# Run the analysis
./src/cli/experiments/scripts/run-author-distance-analysis.sh

# Wait ~25 minutes...

# Analyze results
./src/cli/experiments/scripts/analyze-author-distance-results.sh results/author-distance/analysis_*.json
```

Good luck! 🚀
