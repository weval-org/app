# Model Regression Detection

Tracks performance changes across model versions over time. Compares chronologically ordered releases to identify regressions/improvements at multiple granularities.

## Quick Start

```bash
# Generate regressions
pnpm cli:generate-regressions --limit 20 --exclude-pattern "sandbox-*"

# View UI
open http://localhost:3172/regressions
```

## Granularity Levels

1. **Point-Level**: Individual rubric criteria (e.g., "Cites relevant law": 0.95 → 0.70)
2. **Prompt-Level**: Aggregate hybrid score per prompt
3. **Dimension-Level**: Executive summary grades (1-10 scale)
4. **Blueprint-Level**: Overall performance across entire evaluation

## Severity Classification

| Severity | Threshold | Description |
|----------|-----------|-------------|
| Major | ≥15% | Significant drop |
| Moderate | 8-15% | Noticeable degradation |
| Minor | 5-8% | Measurable change |

## CLI Usage

```bash
# Basic
pnpm cli:generate-regressions

# With filters
pnpm cli:generate-regressions \
  --limit 50 \
  --exclude-pattern "sandbox-*,api-run-*" \
  --series-filter "anthropic-claude-sonnet" \
  --min-score-delta 0.10 \
  --concurrency 60 \
  -v

# Options
# --verbose (-v)              Detailed logging
# --min-score-delta <n>       Minimum change threshold (default: 0.05)
# --series-filter <str>       Only analyze matching series
# --exclude-pattern <list>    Exclude config patterns
# --include-only <list>       Only include specific configs
# --featured-only             Only _featured runs
# --exclude-tags <list>       Exclude by tags
# --limit <n>                 First N blueprints only
# --concurrency <n>           Parallel fetches (default: 30)
```

## Storage

- **Production**: S3 at `multi/aggregates/regressions-summary.json`
- **Development**: Local at `results/multi/aggregates/regressions-summary.json`
- **UI loads via**: `/api/regressions-summary` (automatic S3/local handling)

## UI Structure

**`/regressions`** - Three-tier navigation:
1. **Overview**: Searchable table of all series comparisons with filters (maker, tier, severity)
2. **Series Detail**: Version timeline, aggregate stats, shared blueprints
3. **Comparison View**: Detailed list with tabs (regressions/improvements), multi-dimensional filtering

## Registry Maintenance

Edit `src/lib/model-version-registry.ts` to add new models/versions:

```typescript
{
  seriesId: "anthropic-claude-sonnet",
  seriesName: "Anthropic Claude Sonnet",
  maker: "anthropic",
  tier: "balanced",
  versions: [
    {
      id: "anthropic:claude-3-5-sonnet-20240620",  // Canonical ID
      name: "Claude 3.5 Sonnet",
      releaseDate: "2024-06-20",  // Must be chronological!
      aliases: ["anthropic:claude-3-5-sonnet-20240620", ...]
    }
  ]
}
```

**Rules:**
- Use canonical model IDs from `modelIdUtils.ts`
- Maintain chronological order by `releaseDate`
- Add all known aliases for matching
- Run `pnpm test:cli src/lib/__tests__/model-version-registry.test.ts`

## Key Files

- `src/lib/model-version-registry.ts` - Model series definitions
- `src/cli/commands/generate-regressions.ts` - Detection pipeline
- `src/types/regressions.ts` - TypeScript interfaces
- `src/app/(standard)/regressions/` - UI components
- `src/app/api/regressions-summary/route.ts` - API endpoint

## Troubleshooting

**"Failed to load regressions data"**
```bash
pnpm cli:generate-regressions --limit 10
# Creates results/multi/aggregates/regressions-summary.json
# API route loads automatically
```

**Slow performance**
- Use `--limit` for testing
- Increase `--concurrency` (try 60)
- Use `--exclude-pattern` to skip sandboxes

## Future Enhancements

- Response diff viewer (side-by-side text comparison)
- Confidence scoring (sample size, consistency, temperature)
- Historical trends over multiple versions
- Cross-series comparisons (Haiku vs Sonnet)
- Cost-efficiency analysis ($/score)
