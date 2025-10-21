# Experiments

This document catalogs all experimental tools and analyses in the LLM Personalities project. All experiments are organized under `/src/app/experiments/` and their shared libraries under `/src/lib/experiments/`.

---

## Quick Reference

| Experiment | Path | Purpose | Status |
|------------|------|---------|--------|
| [Guess](#guess) | `/experiments/guess` | AI model identification | ✅ Active |
| [LIT](#lit-longer-incubation-time) | `/experiments/lit` | Stylistic divergence generator | ✅ Active |
| [Macro](#macro) | `/experiments/macro` | Evaluation frontier heatmap | ✅ Active |
| [NDeltas](#ndeltas-weak-points-index) | `/experiments/ndeltas` | Model weak points analysis | ✅ Active |
| [Pain Points](#pain-points) | `/experiments/pain-points` | Critical failure tracker | ✅ Active |
| [Redlines](#redlines) | `/experiments/redlines` | Span-level critique annotations | ✅ Active |
| [Strawberry](#strawberry) | `/experiments/strawberry` | R-counting accuracy test | ✅ Active |

---

## Guess

**Location:** `/src/app/experiments/guess`
**Libraries:** `/src/lib/experiments/guess/`

### Overview
AI model identification tool that analyzes text to determine which LLM model likely wrote it by comparing writing styles through embeddings.

### How It Works
1. User pastes 300-10,000 character LLM-generated text
2. Selects analysis mode:
   - **⚡ Quick**: 2 models (Gemini 2.5 Flash, Qwen3) • ~3-5 seconds
   - **🎯 Thorough**: 9 models (GPT-4, GPT-5, Claude Sonnet, Grok, Mistral, DeepSeek R1, Llama 405B, etc.) • ~8-10 seconds
3. System extracts a "reverse prompt" from the text
4. Generates responses from candidate models using that prompt
5. Embeds all texts and calculates cosine distances
6. Ranks models by similarity (lower distance = more likely author)

### Features
- **Multi-paragraph analysis**: Automatically splits long text into paragraphs for better statistical confidence
- **Real-time progress**: Server-Sent Events (SSE) stream with live updates
- **Parallel processing**: Up to 5 texts processed simultaneously
- **Cancellation support**: Aborts analysis when user navigates away
- **Confidence indicators**: Visual badges showing high/moderate/low confidence

### API Routes
- `POST /api/guess/stream` - Streaming analysis with progress (primary endpoint)
- `POST /api/guess/validate` - Content validation (filters nonsensical/offensive text)
- `POST /api/guess/run` - Non-streaming fallback

### Libraries
- **`model-guessor.ts`**: Core algorithm (prompt extraction, generation, embedding, distance calculation)
- **`paragraph-splitter.ts`**: Text preprocessing utilities

### Tech Stack
- Next.js Server-Sent Events (SSE)
- OpenAI embeddings (text-embedding-3-small)
- Adaptive rate limiting per provider
- Parallel text processing with pLimit(5)

---

## LIT (Longer Incubation Time)

**Location:** `/src/app/experiments/lit`
**Libraries:** `/src/lib/experiments/lit/`

### Overview
Experimental tool for generating stylistically divergent re-drafts while preserving content fidelity. Creates multiple rewrites of input text with maximally different writing styles.

### How It Works
1. **Instruction Set Generation**: AI creates diverse stylistic instructions (e.g., "formal academic", "casual conversational")
2. **Candidate Generation**: Multiple models rewrite text following each instruction
3. **Anchor Generation**: Baseline neutral rewrites for comparison
4. **Coverage Analysis**: Measures embedding distance between candidates and anchors
5. **Ranking**: Selects best rewrites using composite or Pareto ranking

### Features
- **Highly configurable**: 15+ tunable parameters
- **Multiple ranking modes**: Composite scoring vs Pareto frontier
- **Coverage gating**: Optional threshold filtering
- **Live streaming**: Watch drafts appear during generation
- **Multi-model support**: Test against different LLM combinations

### API Routes
- `GET/POST /api/lit/stream` - Streaming generation with live drafts
- `POST /api/lit/run` - Non-streaming variant

### Advanced Parameters
```typescript
{
  embeddingModel: string,           // Embedding model for distance calculation
  compilerModel: string,            // Model for generating instructions
  coverageModel: string,            // Model for coverage analysis
  candidateModels: string[],        // Models for candidate generation
  anchorModels: string[],           // Models for anchor generation
  temperatures: number[],           // Temperature variations
  rankingMode: 'composite' | 'pareto',
  coverageWeight: number,           // Weight for coverage in composite mode
  coverageThreshold: number,        // Minimum coverage required
  coverageGate: boolean,            // Enable threshold filtering
  topN: number                      // Number of results to return
}
```

### Libraries
- **`core.ts`**: Main LIT execution engine
- **`types.ts`**: Type definitions

### Use Cases
- Content diversification for training data
- Style transfer research
- Testing model style range
- Generating varied examples from single source

---

## Macro

**Location:** `/src/app/experiments/macro`

### Overview
Large-scale heatmap visualization showing the evaluation frontier - aggregate performance of all models across all evaluation dimensions.

### How It Works
- **Canvas-based rendering**: Massive heatmaps drawn on HTML canvas (not DOM) for performance
- **Color-coded scores**: Red (poor) → Yellow → Green (perfect)
- **Two view modes**:
  1. **Flat view**: All evaluation points in single grid
  2. **Per-model cards**: Individual grids per model showing coverage patterns

### Features
- **Headline average**: "State of frontier AI" score across all evaluations
- **Interactive exploration**: Hover to see point indices
- **Per-model snapshots**: Individual performance patterns
- **Request limiting**: Max 8 concurrent fetches to avoid server overload

### API Routes
- `GET /api/macro/flat/manifest` - Metadata (dimensions, average score)
- `GET /api/macro/flat/data` - Binary heatmap data
- `GET /api/macro/flat/models/manifest` - List of per-model snapshots
- `GET /api/macro/flat/models/[modelId]/data` - Per-model binary data
- `GET /api/macro/index` - Index/listing
- `GET /api/macro/configs/[configId]` - Config-specific data
- `GET /api/macro/configs/[configId]/prompts/[promptId]` - Prompt-level data

### Visualization
- Grid layout with wrapped cards
- Color interpolation for smooth gradients
- Responsive canvas scaling
- Hover effects with point information

---

## NDeltas (Weak Points Index)

**Location:** `/src/app/experiments/ndeltas`

### Overview
Identifies and displays prompts where models underperform compared to peer average. Helps pinpoint specific model weaknesses.

### How It Works
1. Aggregates results across all system prompts and temperature variants
2. Calculates delta: `model_performance - peer_average`
3. Negative deltas = weak points (underperformance)
4. Sorts by worst deltas

### Features
- **Index page**: Lists all models with worst/median deltas
- **Detail page**: Full table of weak prompts for specific model
  - Delta value, coverage scores, peer averages
  - Percentile/quartile information
  - Top performing models for comparison
  - Full prompt context and model response
  - Links to detailed evaluation runs

### API Routes
- `GET /api/ndeltas/[modelId]` - Fetch NDeltas for specific model

### Use Cases
- Identify systematic model weaknesses
- Compare model performance to peers
- Find evaluation cases for targeted improvement
- Understand relative model strengths

---

## Pain Points

**Location:** `/src/app/experiments/pain-points`

### Overview
Summary of the most significant model failures ranked by severity. Shows worst-performing model+prompt combinations across all evaluations.

### How It Works
- Fetches aggregated failure data from storage
- Displays expandable list of pain points
- Each item shows:
  - **Coverage score** (severity badge)
  - **Model identifier**
  - **Config/evaluation name**
  - **Expandable details**:
    - Full prompt text
    - Model's response
    - Failed criteria with scores
    - Judge reflections
    - Deep dive link

### Features
- **Severity badges**: Color-coded by coverage score
- **Collapsible UI**: Expand to see full context
- **Markdown rendering**: Formatted responses
- **Auto-refresh**: Revalidates every 60 seconds

### API Routes
- `GET /api/pain-points` - Fetch pain points summary (revalidate: 60s)

### Use Cases
- Quick triage of critical failures
- Understanding common failure patterns
- Prioritizing evaluation improvements
- Model debugging

---

## Redlines

**Location:** `/src/app/experiments/redlines`

### Overview
Span-level critique annotations showing specific issues/problems in model responses. Uses inline markup to highlight problem areas.

### How It Works
- Displays model responses with XML-like inline annotations
- **Red highlighting**: Problem spans marked with `<issue>` tags
- Shows issue title on hover
- Additional issues listed below response
- Includes rubric context and annotator metadata

### Features
- **Inline rendering**: Issues highlighted directly in text
- **Two views**:
  - **Index**: All redlines across all configs
  - **Config view**: Filtered to specific evaluation
- **Annotator metadata**: Shows which LLM performed annotation

### API Routes
- `GET /api/redlines` - All redlines feed (optional limit param)
- `GET /api/redlines/[configId]` - Config-specific redlines

### Example
```xml
The capital of France is <issue title="Factual error">London</issue>.
```

### Use Cases
- Fine-grained error analysis
- Understanding specific failure modes
- Training annotation models
- Quality assurance

---

## Strawberry

**Location:** `/src/app/experiments/strawberry`

### Overview
Specialized test measuring whether frontier AI models can accurately count the letter "R" in misspelled variations of "strawberry". Famous for revealing surprising failures in advanced models.

### How It Works
- **Test dataset**: Misspelled variations with different R counts (1-6+)
- **Correct answer**: "strawberry" = 3 Rs
- **Visualizations**:
  1. **Strawberry Index Score**: Average accuracy (0-100)
  2. **Animated Canvas**: Pixel art strawberry that "wobbles" when models are confused
     - Hover: Aligns to perfect strawberry (= correctness)
     - No hover: Jitters (= confusion level)
  3. **Model Leaderboard**: Average accuracy with progress bars
  4. **Per-case Results**: All test prompts with accuracy percentages

### Features
- **Terminal aesthetic**: Green-on-black monospace theme
- **Color coding**:
  - Green background: Correct R count (3)
  - Red background: Incorrect count
  - Progress bars: Green >70%, Yellow >30%, Red <30%
- **Interactive canvas**: Visual representation of model performance

### Visualization Details
```
Strawberry Index: 73.2%
████████████████████░░░░░░░░

Models Tested:
  GPT-4: 85.0% ████████████████████████░░░░
  Claude: 78.3% ██████████████████████░░░░░░

R-Counting Results:
  1R (strwbery):  92% ████████████████████████░░
  3R (strawberry): 100% ████████████████████████████
  6R (strrawwberrry): 45% █████████░░░░░░░░░░░░░░░░░
```

### API Routes
- Uses `listRunsForConfig()` and `getCoreResult()` from storage service
- No dedicated API routes (fetches from general evaluation storage)

### Why This Matters
Reveals surprising gaps in language model understanding of:
- Character-level reasoning
- Spelling analysis
- Basic counting tasks
- Handling of noise/misspellings

---

## Shared Infrastructure

### Common Libraries
All experiments use these shared services:

| Library | Used By | Purpose |
|---------|---------|---------|
| `@/lib/storageService` | macro, ndeltas, pain-points, redlines, strawberry | Data persistence and retrieval |
| `@/lib/experiments/guess/model-guessor` | guess | Core guessing algorithm |
| `@/lib/experiments/guess/paragraph-splitter` | guess | Text preprocessing |
| `@/lib/experiments/lit/core` | lit | LIT execution engine |
| `@/lib/experiments/lit/types` | lit | Type definitions |
| `@/app/utils/modelIdUtils` | guess, pain-points, strawberry | Model ID formatting |
| `@/lib/timestampUtils` | ndeltas | Timestamp utilities |
| `@/app/components/ResponseRenderer` | pain-points | Markdown rendering |
| `@/cli/config` | guess, lit | CLI configuration |

### API Patterns
- **Streaming**: SSE (Server-Sent Events) for long-running operations (guess, lit)
- **Static**: GET endpoints for data visualization (macro, redlines, pain-points)
- **Hybrid**: Both streaming and non-streaming variants (guess, lit)

### Design Principles
1. **Progressive disclosure**: Show results as they arrive
2. **Cancellation support**: Allow users to abort long operations
3. **Parallel processing**: Maximize throughput with rate limiting
4. **Caching**: Reuse embeddings and responses when possible
5. **Real-time feedback**: Progress indicators for all long operations

---

## Adding New Experiments

To add a new experiment:

1. **Create directory structure**:
   ```
   src/app/experiments/your-experiment/
     ├── page.tsx          (Next.js page)
     ├── Client.tsx        (Optional: client component)
     └── components/       (Optional: experiment-specific components)
   ```

2. **Add shared libraries** (if needed):
   ```
   src/lib/experiments/your-experiment/
     ├── core.ts           (Main logic)
     ├── types.ts          (Type definitions)
     └── utils.ts          (Utilities)
   ```

3. **Create API routes** (if needed):
   ```
   src/app/api/your-experiment/
     └── route.ts
   ```

4. **Update this documentation**:
   - Add to Quick Reference table
   - Add detailed section following the template
   - Update Shared Infrastructure section if needed

5. **Follow naming conventions**:
   - Use kebab-case for directories (`my-experiment`)
   - Use PascalCase for components (`MyExperiment.tsx`)
   - Use camelCase for functions (`runMyExperiment()`)

---

## Development Tips

### Running Experiments Locally
```bash
# Start dev server
pnpm dev

# Navigate to experiment
open http://localhost:3000/experiments/guess
```

### Testing API Routes
```bash
# Streaming endpoint
curl -N http://localhost:3000/api/guess/stream \
  -H "Content-Type: application/json" \
  -d '{"text":"Sample text...","mode":"quick"}'

# Static endpoint
curl http://localhost:3000/api/pain-points
```

### Debugging
- Check browser console for client errors
- Check terminal output for server logs
- Use Next.js error boundary for graceful failures
- Add request IDs for tracing (see guess implementation)

---

## Performance Considerations

### Guess
- Parallel text processing: pLimit(5)
- Adaptive rate limiting per provider
- Embedding cache (in-memory)
- Cancellation support to save API costs

### LIT
- Streaming results as they arrive
- Configurable batch sizes
- Temperature variations for diversity

### Macro
- Canvas rendering (not DOM) for large heatmaps
- Request limiting (max 8 concurrent)
- Binary data transfer for efficiency

### General
- SSE for long-running operations
- Incremental rendering where possible
- Caching at multiple levels
- Abort signals propagated through stack

---

## Future Work

Potential experiment ideas:
- **Consistency Checker**: Test response stability across temperatures
- **Prompt Sensitivity**: Measure output variance from minor prompt changes
- **Cross-Model Translation**: Transform outputs between model styles
- **Failure Mode Clustering**: Group similar errors across evaluations
- **Real-time Comparison**: Side-by-side model response streaming

---

## Questions?

For questions or issues with experiments:
1. Check this documentation first
2. Review the experiment's source code
3. Check API route implementations
4. Look at similar experiments for patterns

---

*Last updated: 2025-01-XX*
