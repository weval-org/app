# Author Distance Analysis - Implementation Notes

## What Was Built

A complete MVP for comparing model embedding distances to literary author distances, enabling statements like:

> "The embedding distance between GPT-4o and GPT-5 is equivalent in magnitude to the distance between Maya Angelou and Ernest Hemingway when measured on comparable creative writing tasks."

## Architecture

### Files Created

```
src/cli/
├── experiments/
│   ├── author-distance-types.ts       # Type definitions
│   ├── author-distance-analysis.ts    # Core analysis logic
│   ├── README.md                      # Methodology & concepts
│   ├── USAGE.md                       # Quick start guide
│   └── IMPLEMENTATION_NOTES.md        # This file
└── commands/
    └── author-distance.ts             # CLI command

examples/
├── author-passages-sample.json        # Full sample (7 authors)
└── author-passages-test.json          # Minimal test (2 authors)
```

### Pipeline Flow

```
1. Load author passages
   ↓
2. Extract prompts (using LLM)
   - System prompt: "Given a passage, output a prompt that could trigger it"
   - Simple, unbiased extraction
   ↓
3. Generate model responses
   - Each candidate model attempts each extracted prompt
   - Multiple samples per prompt (default: 3)
   - Temperature: 0.7 (creative writing)
   ↓
4. Embed everything
   - Author passages → embeddings
   - Model responses → embeddings
   - Same embedding model for all (default: text-embedding-3-small)
   ↓
5. Calculate distances
   - Author-to-author: baseline comparison
   - Model-to-model: what we want to measure
   - Model-to-author: optional context
   - Using cosine distance: 1 - (A·B)/(||A|| ||B||)
   ↓
6. Interpret
   - Find which author pair distance is closest to each model pair
   - Output comparison with percentage difference
```

## Design Decisions

### 1. Simplified Prompt Extraction

**User's insight:** "I think your 'extract_prompt_from_passage' is over-engineered. I think we want to give less clues or tilt the output."

**Implementation:** Simple system prompt with one example, no detailed analysis or rubric. This minimizes bias in extraction.

### 2. Default Models

- **Extractor:** `openai:gpt-4o-mini` (fast, reliable, cheap)
  - User mentioned `openrouter:qwen/qwen3-vl-30b-a3b-instruct` but that model ID wasn't valid
  - Easy to override with `--extractor-model` flag
- **Embedding:** `openai:text-embedding-3-small` (standard, 1536 dims)
  - Can use `text-embedding-3-large` for higher accuracy

### 3. Concurrency & Caching

- **Prompt extraction:** 5 concurrent (conservative)
- **Response generation:** 10 concurrent
- **Embedding:** 20 concurrent
- All LLM responses and embeddings are cached automatically

### 4. Distance Metric

Using **cosine distance** (not similarity):
```typescript
distance = 1 - similarity
distance = 1 - (A·B)/(||A|| ||B||)
```

Range: [0, 2] where 0 = identical, 2 = opposite

This is standard for comparing text embeddings.

### 5. Multiple Samples

Generate multiple responses per prompt (default: 3) to:
- Reduce variance from temperature randomness
- Get more stable distance measurements
- Average across samples for final distance

## Testing Results

Quick test with 2 authors × 2 models × 1 sample:

```
Authors: Lewis Carroll, Ernest Hemingway
Models: gpt-4o-mini, claude-3.5-haiku

Results:
- Author distance (Carroll ↔ Hemingway): 0.733
- Model distance (gpt-4o-mini ↔ claude-3.5-haiku): 0.106

Interpretation: The two modern models are much more similar to each other
than the two distinctive authors (which is expected!)
```

**Runtime:** ~30 seconds (with caching for subsequent runs)

## Usage

```bash
# Quick test
pnpm cli author-distance \
  --passages examples/author-passages-test.json \
  --models "openai:gpt-4o-mini,anthropic:claude-3-5-haiku-20241022" \
  --samples 1

# Full analysis
pnpm cli author-distance \
  --passages examples/author-passages-sample.json \
  --models "openai:gpt-4o,openai:gpt-5" \
  --samples 5 \
  --extractor-model "openai:gpt-4o" \
  --output ./results/gpt4o-vs-gpt5.json
```

## Future Enhancements

### Statistical Rigor
- [ ] Bootstrap confidence intervals for distances
- [ ] Significance testing (between-model distance > within-model variance)
- [ ] Control experiments (same model, different temps/prompts)

### Visualization
- [ ] t-SNE/UMAP plots showing models + authors in shared space
- [ ] Dendrograms for hierarchical clustering
- [ ] Heatmaps of distance matrices

### Multi-Embedding Consensus
- [ ] Run analysis with multiple embedding models
- [ ] Average or vote across different embedders
- [ ] Report variance across embedding models

### Passage Analysis
- [ ] Per-passage distance breakdown
- [ ] Identify which passages drive the most/least distance
- [ ] Cluster passages by difficulty or style

### Extended Metrics
- [ ] Mahalanobis distance (accounts for covariance)
- [ ] Procrustes distance (alignment-invariant)
- [ ] Information-theoretic divergences

## Known Limitations

1. **Prompt dependence**: Extracted prompts may not perfectly capture author style
2. **Sample size**: With only 2-3 samples per prompt, variance is high
3. **Domain specificity**: Results depend on passage selection
4. **Memorization risk**: Models may have seen famous author passages in training
5. **Embedding model bias**: Different embedders may yield different results

## Validation Strategy

To validate claims:

1. **Reproducibility:** Run same analysis multiple times, verify distance stability
2. **Swap test:** Author A responses to Author A prompts should be closer than to Author B prompts
3. **Control distances:** Same model at different temps should have smaller distance than different models
4. **Cross-validation:** Use different passage sets, verify consistent author distances
5. **Multiple embedders:** Repeat with `text-embedding-3-large`, Together AI, etc.

## API Cost Estimates

For 7 authors × 2 models × 3 samples:

- **Prompt extraction:** 7 × gpt-4o-mini calls (~$0.02)
- **Response generation:** 7 × 2 × 3 = 42 × model calls (~$0.50 - $5 depending on models)
- **Embeddings:** (7 + 42) = 49 embeddings (~$0.001)

**Total:** ~$0.50 - $5.00 per run (mostly model response generation)

With caching, subsequent runs are essentially free!

## Code Quality

- ✅ TypeScript with full type safety
- ✅ Reuses existing weval utilities (llm-service, embedding-service, pLimit)
- ✅ Comprehensive error handling
- ✅ Progress logging throughout
- ✅ Structured output (JSON with metadata)
- ✅ CLI command integrated into main weval CLI
- ✅ Documentation (README, USAGE, this file)

## Experimental Status

This code lives in `src/cli/experiments/` to indicate:
- It's a research tool, not production feature
- It may evolve based on findings
- It's not (yet) integrated with the main weval evaluation pipeline
- It's CLI-only (no web UI)

If this proves valuable, it could be:
- Integrated into main weval analysis
- Added to web UI for interactive exploration
- Published as a standalone tool
- Expanded with the enhancements listed above
