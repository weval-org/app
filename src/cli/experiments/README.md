# Author Distance Analysis Experiment

This experiment compares the embedding distance between LLM models to the distance between literary authors, allowing you to quantify and contextualize model personality shifts in human-relatable terms.

## Concept

When a model is updated (e.g., GPT-4o → GPT-5), the embedding distance between their outputs can be compared to the embedding distance between well-known authors (e.g., Maya Angelou ↔ Ernest Hemingway). This provides an intuitive way to communicate the magnitude of behavioral change.

## How It Works

1. **Extract prompts from author passages**: An LLM reads distinctive passages from various authors and extracts creative writing prompts that could have generated similar text.

2. **Generate model responses**: Candidate models respond to these extracted prompts (with multiple samples per prompt to reduce variance).

3. **Embed everything**: Both original author passages and model responses are converted to embeddings using the same embedding model.

4. **Calculate distances**: Cosine distances are computed between:
   - Author pairs (baseline comparison)
   - Model pairs (what we want to measure)
   - Models and authors (optional context)

5. **Interpret**: Find which author pair distance is closest to each model pair distance, providing a literary analogy.

## Usage

### Basic Command

```bash
pnpm cli author-distance \
  --passages examples/author-passages-sample.json \
  --models "openai:gpt-4o,anthropic:claude-3.5-sonnet" \
  --output ./results/author-distance-results.json
```

### Full Options

```bash
pnpm cli author-distance \
  --passages <path-to-passages.json> \
  --models <comma-separated-model-ids> \
  --embedding-model openai:text-embedding-3-small \
  --extractor-model openrouter:qwen/qwen-3-30b-a3b-instruct \
  --samples 3 \
  --temperature 0.7 \
  --output ./results.json
```

### Input Format

The passages file should be a JSON array of objects:

```json
[
  {
    "author": "Lewis Carroll",
    "passage": "It was eight-sided, having in each angle...",
    "work": "Sylvie and Bruno",
    "rationale": "Geometrical whimsy + botanical impossibility",
    "passage_type": "architectural description"
  }
]
```

Or JSONL (one JSON object per line):

```jsonl
{"author": "Lewis Carroll", "passage": "It was eight-sided..."}
{"author": "Ernest Hemingway", "passage": "In the late summer..."}
```

### Output Format

The results JSON includes:

- **metadata**: Configuration and run details
- **extractedPrompts**: Prompts generated from each passage
- **embeddings**: All embedding vectors
- **distances**: Distance matrices (author-author, model-model, model-author)
- **interpretation**: Which author pairs match which model pairs

Example interpretation:

```json
{
  "interpretation": {
    "closestAuthorPairs": [
      {
        "modelPair": ["openai:gpt-4o", "openai:gpt-5"],
        "distance": 0.1234,
        "closestAuthorPair": ["Maya Angelou", "Ernest Hemingway"],
        "authorDistance": 0.1256,
        "percentageDifference": 1.8
      }
    ]
  }
}
```

## Selecting Good Passages

For best results, choose passages that:

- ✅ Showcase unique stylistic fingerprints
- ✅ Are self-contained (don't require context)
- ✅ Are 100-300 words long
- ✅ Aren't heavily dialogue-based
- ❌ Avoid famous/widely-quoted passages (models may have memorized them)

## Caveats & Interpretation

1. **Domain matching**: The extracted prompts ensure models attempt the same stylistic challenges as the authors.

2. **Magnitude, not style**: A distance match means the *scale* of difference is similar, not that GPT-5 "writes like Hemingway."

3. **Statistical validity**: Multiple samples per prompt help reduce variance. Bootstrap confidence intervals would further strengthen claims.

4. **Embedding model dependence**: Different embedding models may produce different results. Consider running with multiple embedders.

5. **Prompt extraction quality**: The extractor LLM's ability to capture the essence of each passage affects comparability.

## Example Use Case

> "The embedding distance between GPT-4o and GPT-5 (0.123) is equivalent in magnitude to the distance between Maya Angelou and Ernest Hemingway (0.125) when measured on comparable creative writing tasks. This suggests a fundamental shift in model behavior, not mere parameter tuning."

## Files

- `author-distance-types.ts`: TypeScript type definitions
- `author-distance-analysis.ts`: Core analysis logic
- `../commands/author-distance.ts`: CLI command implementation
- `../../examples/author-passages-sample.json`: Sample input data

## Future Enhancements

- Bootstrap confidence intervals for statistical rigor
- Support for multiple embedding models (consensus)
- Visualization: t-SNE/UMAP plots of models + authors in shared space
- Control experiments (same model, different temps/system prompts)
- Per-passage breakdown (which passages drive the most distance)
