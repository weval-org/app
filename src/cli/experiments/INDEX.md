# Author Distance Analysis - File Index

**Quick Navigation for the Author Distance Experiment**

---

## 📖 Documentation (Start Here)

### [PROGRESS.md](./PROGRESS.md)
**Development log and current status**
- What we built
- Validation results
- Known issues
- Design decisions
- Next steps

### [AUTHOR_DISTANCE_QUICKSTART.md](./AUTHOR_DISTANCE_QUICKSTART.md)
**Quick start guide - run this first!**
- Basic usage examples
- Full analysis instructions
- Troubleshooting tips

### [README.md](./README.md)
**Methodology and concepts**
- How the analysis works
- Conceptual foundation
- Validation strategy
- Future enhancements

### [USAGE.md](./USAGE.md)
**Detailed usage instructions**
- Command options
- Configuration tips
- Cost estimates
- Best practices

### [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md)
**Technical implementation details**
- Architecture overview
- Code quality notes
- API costs
- Experimental status

---

## 💻 Source Code

### [author-distance-types.ts](./author-distance-types.ts)
TypeScript type definitions for the entire analysis pipeline

### [author-distance-analysis.ts](./author-distance-analysis.ts)
Core analysis logic:
- `extractPromptsFromPassages()` - Prompt extraction
- `generateModelResponses()` - Response generation
- `embedAllTexts()` - Embedding calculation
- `calculateDistances()` - Distance matrix computation
- `interpretResults()` - Literary analogy matching
- `runAuthorDistanceAnalysis()` - Main orchestrator

### [../commands/author-distance.ts](../commands/author-distance.ts)
CLI command implementation (registered in main weval CLI)

---

## 📊 Example Data

### [examples/author-passages-sample.json](./examples/author-passages-sample.json)
**Full dataset - 7 authors**
- Lewis Carroll (whimsical, geometric)
- Ernest Hemingway (sparse, declarative)
- Virginia Woolf (stream of consciousness)
- James Baldwin (philosophical, emotional)
- Ursula K. Le Guin (sensory, mysterious)
- Toni Morrison (mythic, rhythmic)
- Joan Didion (clinical, precise)

### [examples/author-passages-test.json](./examples/author-passages-test.json)
**Minimal test dataset - 2 authors**
Use for quick validation (~2 minutes)

### [examples/model-selection-for-analysis.json](./examples/model-selection-for-analysis.json)
**Strategic model selection rationale**
- 12 recommended models
- Coverage analysis
- Expected insights
- Runtime/cost estimates

---

## 🔧 Scripts

### [scripts/run-author-distance-analysis.sh](./scripts/run-author-distance-analysis.sh)
**Main analysis runner**
- Runs full 12-model analysis
- Saves timestamped results
- ~25-30 minute runtime

### [scripts/analyze-author-distance-results.sh](./scripts/analyze-author-distance-results.sh)
**Results analyzer**
- Pretty-prints findings
- Extracts key metrics
- Shows GPT-4o comparisons

---

## 🚀 Quick Commands

### Run Quick Test
```bash
pnpm cli author-distance \
  --passages src/cli/experiments/examples/author-passages-test.json \
  --models "openrouter:openai/gpt-4o,openrouter:openai/gpt-4o-mini" \
  --samples 1 \
  --output /tmp/quick-test.json
```

### Run Full Analysis
```bash
./src/cli/experiments/scripts/run-author-distance-analysis.sh
```

### Analyze Results
```bash
./src/cli/experiments/scripts/analyze-author-distance-results.sh results/author-distance/analysis_*.json
```

---

## 📁 Directory Structure

```
src/cli/experiments/
├── AUTHOR_DISTANCE_QUICKSTART.md  # Start here!
├── IMPLEMENTATION_NOTES.md        # Technical details
├── INDEX.md                       # This file
├── PROGRESS.md                    # Development log
├── README.md                      # Methodology
├── USAGE.md                       # Detailed usage
├── author-distance-analysis.ts   # Core logic
├── author-distance-types.ts      # Type definitions
├── examples/
│   ├── author-passages-sample.json       # Full dataset (7 authors)
│   ├── author-passages-test.json         # Test dataset (2 authors)
│   └── model-selection-for-analysis.json # Model selection guide
└── scripts/
    ├── analyze-author-distance-results.sh  # Results analyzer
    └── run-author-distance-analysis.sh     # Main runner
```

---

## 🎯 Recommended Reading Order

1. **[PROGRESS.md](./PROGRESS.md)** - Understand what's been built
2. **[AUTHOR_DISTANCE_QUICKSTART.md](./AUTHOR_DISTANCE_QUICKSTART.md)** - Run a quick test
3. **[README.md](./README.md)** - Learn the methodology
4. **[USAGE.md](./USAGE.md)** - Deep dive into options
5. **[IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md)** - Technical details

---

## ✅ Current Status

- **MVP:** Complete and validated ✅
- **Pipeline:** Fully functional end-to-end ✅
- **Documentation:** Comprehensive ✅
- **Testing:** Validated with 3 models × 7 authors ✅
- **Ready for:** Production use with available models

---

## 🔮 Next Steps

1. Run full analysis with working models (no GPT-5 yet)
2. Establish baseline cross-vendor distances
3. Add GPT-5 when truly available
4. Prove hypothesis with concrete data

---

**Questions?** See [USAGE.md](./USAGE.md) for detailed instructions or [AUTHOR_DISTANCE_QUICKSTART.md](./AUTHOR_DISTANCE_QUICKSTART.md) for quick examples.
