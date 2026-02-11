# India Multilingual Pilot

Custom pilot page for the India Multilingual evaluation comparing Claude Opus 4.5 vs Sonnet 4.5 responses to legal and agriculture questions across 7 Indian languages.

**Source Data**: `/Users/james/proj/anthropic-legal-agri/` (Karya evaluation exports)
**Live Pages**:
- `/pilot/india-multilingual` — v1: Original LLM judge calibration analysis
- `/pilot/india-multilingual/v2` — v2: Comprehensive redesign with CIP branding

## Overview

This pilot displays two complementary datasets:

1. **Head-to-Head Comparisons** (10,629 evaluations) - The main event. Native speakers saw both Opus and Sonnet responses to the same question and chose which was better.

2. **Rubric-Based Ratings** (20,246 unique after dedup, 128 workers) - Standalone ratings where workers rated individual responses on trust, fluency, complexity, and code-switching. Used for LLM judge calibration analysis.

**Key Finding**: Opus 4.5 preferred 63.1% of the time in head-to-head comparisons across all 7 languages.

## Data Pipeline

```
Karya CSV Exports
       ↓
Processing Scripts (___karya-to-weval-export-v3.py, etc.)
       ↓
Processed JSON Files (___india-multilingual/)
       ↓
weval Run (fixtures + LLM judge evaluation)
       ↓
Pilot Page (this directory)
```

### Source Files (anthropic-legal-agri/data/)

| File | Records | Description |
|------|---------|-------------|
| `Worker_Evaluations_Comparative - worker-Anthropic_Comparative_Report.csv` | 10,629 | Head-to-head A/B comparisons |
| `Worker_Evaluations_Standalone - worker-Anthropic_Standalone_Report.csv` | 10,562 | Single-response rubric ratings |

### Processed Files (___india-multilingual/)

| File | Description |
|------|-------------|
| `comparative_results.json` | Aggregated head-to-head results (10,629 comparisons, 119 workers) |
| `comparison_samples.json` | 350 stratified samples for DataExplorer (50/language) |
| `rubric_summary.json` | Aggregated rubric scores + worker reliability |
| `overlap_workers.json` | 20 workers who did both tasks + paradox analysis |
| `fixtures-full.json` | Model responses keyed by prompt ID (for weval) |
| `human_ratings-full.json` | Human ratings keyed by prompt ID (for comparison) |
| `india-multilingual-full.yml` | weval blueprint with 10,694 prompts |
| `worker_reliability-full.json` | Worker reliability scores |

## Data Structures

### Comparative Dataset (Head-to-Head)

Each row = one worker comparing Opus vs Sonnet on the same question.

**Key columns:**
- `worker_id` - Anonymous evaluator ID
- `language` - Hindi, Bengali, Telugu, Kannada, Malayalam, Assamese, Marathi
- `domain` - Legal or Agriculture
- `question` - The prompt (in native language)
- `answer1`, `answer2` - The two model responses
- `answer_1_model_id`, `answer_2_model_id` - Which model generated which answer
- `answer_choice` - Worker's selection (see "Data Quirks" below)
- `reason_audio` - Audio recording filename (see "Audio Recordings" below)

**Answer choice values** (in worker's native language):
- "Answer 1 is better" / "Answer 2 is better"
- "Both answers are equally good"
- "Both answers are equally bad"

### Standalone Dataset (Rubric Ratings)

Each row = one worker rating a single response on multiple criteria.

**Key columns:**
- `trust_rating` - 3-point: trust / somewhat trust / don't trust
- `language_errors` - 3-point: very fluent / somewhat / not at all
- `language_style` - 3-point: too complex / appropriate / too simple
- `local_relevance_rating` - 4-point: too many English words / appropriate / should use more / no English

**Normalization** (for analysis):
- Trust: 0.0 (don't trust) → 0.5 (somewhat) → 1.0 (trust)
- Fluency: 0.0 (not fluent) → 0.5 (somewhat) → 1.0 (very fluent)
- Complexity: 0.5 (too complex/simple) → 1.0 (appropriate)
- Code-switching: 0.5 (too many/few) → 1.0 (appropriate)

## Data Quirks

### 1. Answer Choice JSON Wrapper

The `answer_choice` field is wrapped in a JSON array:
```
["উত্তর 2 বেশী ভালো।"]  ← Note the ["..."] wrapper
```

Parsing code must strip this wrapper before matching choice patterns.

### 2. Choice Patterns by Language

**EXACT patterns** (copy-paste these for matching):

| Language | "Answer 1 better" | "Answer 2 better" | "Equally good" |
|----------|-------------------|-------------------|----------------|
| Hindi | `जवाब 1 बेहतर है` | `जवाब 2 बेहतर है` | `दोनों जवाब समान रूप से अच्छे हैं` |
| Bengali | `উত্তর 1 বেশী ভালো।` | `উত্তর 2 বেশী ভালো।` | `উভয় উত্তরই সমান ভালো।` |
| Telugu | `సమాధానం 1 ఉత్తమమైనది` | `సమాధానం 2 ఉత్తమమైనది` | `రెండు సమాధానాలు సమానంగా బాగున్నాయి` |
| Kannada | `ಉತ್ತರ 1 ಉತ್ತಮ` | `ಉತ್ತರ 2 ಉತ್ತಮ` | `ಎರಡೂ ಉತ್ತರಗಳು ಸಮಾನವಾಗಿ ಉತ್ತಮವಾಗಿವೆ` |
| Malayalam | `ഉത്തരം 1 ആണ് നല്ലത്` | `ഉത്തരം 2 ആണ് നല്ലത്` | `രണ്ട് ഉത്തരങ്ങളും ഒരുപോലെ നല്ലതാണ്.` |
| Assamese | `১ নং উত্তৰটো বেছি ভাল` | `২ নং উত্তৰটো বেছি ভাল` | `দুয়োটা উত্তৰেই সমানে ভাল` |
| Marathi | `उत्तर 1 अधिक चांगले आहे` | `उत्तर 2 अधिक चांगले आहे` | `दोन्ही उत्तरे समानपणे चांगली आहेत` |

### 3. Model Position Randomization

The models are randomly assigned to answer1/answer2 positions. Always check `answer_1_model_id` and `answer_2_model_id` to map choices to Opus/Sonnet.

### 4. Position Bias

Workers slightly favor the second answer. Effect varies by language:
- Malayalam: 26.5pp swing (most biased)
- Telugu: 1.6pp swing (least biased)
- Overall: ~6.5pp favor for position 2

### 5. Independent Question Sets

Each language has its own independently-created questions (NOT translations). Cross-language comparison of specific questions is not possible.

## Audio Recordings

**100% of comparative evaluations have audio explanations** where workers verbally explain their choice.

- Average duration: ~18 seconds
- Format: Audio files on Karya's servers
- Status: **Not yet accessible** - requires Karya coordination

The `reason_audio` column contains the filename, and `reason_duration` contains duration in seconds.

## Worker Reliability

Workers are scored on 4 dimensions (see `worker_reliability-full.json`):

1. **Variance (40%)** - Do they use the full rating scale?
2. **Cross-criterion consistency (30%)** - Does low fluency correlate with low trust?
3. **Model differentiation (15%)** - Do they rate Opus vs Sonnet differently?
4. **Domain sensitivity (15%)** - Different ratings for Legal vs Agriculture?

**Tiers:**
- High reliability: composite ≥ 0.4
- Medium reliability: 0.2 ≤ composite < 0.4
- Low reliability: composite < 0.2

## Regenerating Data

All scripts are in `/Users/james/proj/weval-workspace/`:

### Comparison Samples (for DataExplorer)

```bash
python ___generate-comparison-samples.py
# → ___india-multilingual/comparison_samples.json
# 350 samples (50/language), stratified by outcome distribution
```

**Key implementation notes**:
- Strip `["..."]` wrapper from `answer_choice` field
- Match exact language-specific patterns (see Choice Patterns table)
- Check `answer_1_model_id` to map answer choice → model preference (positions are randomized)

### Comparative Results

```bash
# Similar logic to sample generation, but aggregates all 10,629 evaluations
# → ___india-multilingual/comparative_results.json
```

### Rubric Summary

```bash
python ___regenerate-rubric-summary.py
# → ___india-multilingual/rubric_summary.json
# Aggregated scores + worker reliability tiers + stratified raw samples
```

### Full weval Export

```bash
python ___karya-to-weval-export-v3.py        # Full dataset
python ___karya-to-weval-export-v3.py --sample  # 35-prompt sample
```

### Merge Human Ratings into weval Results

```bash
python ___merge-human-ratings-v2.py
```

## Page Components

### v1 (Original)

```
src/app/pilot/india-multilingual/
├── page.tsx                    # Server component, loads data
├── PilotClient.tsx             # Main client component
└── components/
    ├── HeroSection.tsx         # Introduction
    ├── MethodologySection.tsx  # How data was collected
    ├── HeadToHeadResults.tsx   # Main comparative results (Opus 63%)
    ├── ExemplarWorkers.tsx     # Worker profile deep-dives
    ├── FindingsSection.tsx     # LLM judge vs human findings
    ├── BreakdownTable.tsx      # Detailed criterion breakdown
    ├── DataQualitySection.tsx  # Worker reliability stats
    ├── DisagreementExplorer.tsx # Human-LLM disagreement cases
    ├── PromptExplorer.tsx      # Browse all prompts
    ├── ImplicationsSection.tsx # Conclusions
    └── PilotFooter.tsx         # Credits
```

### v2 (Comprehensive Redesign)

```
src/app/pilot/india-multilingual/v2/
├── page.tsx                    # Server component, loads all data
├── V2Client.tsx                # Main client with section orchestration
└── components/
    ├── HeroStat.tsx            # CIP × weval branding, 4-column stats
    ├── ContextSection.tsx      # Study context and methodology
    ├── ComparisonGame.tsx      # Interactive A/B comparison game
    ├── LanguageBreakdown.tsx   # Opus rate by language with bars
    ├── EqualVerdicts.tsx       # "Both equally good/bad" analysis
    ├── RubricOverview.tsx      # 4 criteria cards + "The Paradox"
    ├── RawFeedbackSamples.tsx  # Native-script human feedback examples
    ├── OverlapWorkersAnalysis.tsx # 20 workers who did both tasks
    ├── EvaluatorProfiles.tsx   # Curated worker archetypes
    ├── WorkerReliabilityChart.tsx # High/medium/low reliability bars
    ├── MethodologyNotes.tsx    # Technical notes
    ├── DataExplorer.tsx        # Browse 350 stratified samples
    └── Footer.tsx              # Credits
```

**v2 Key Features**:
- "The Collective Intelligence Project × weval" branding
- Interactive comparison game (guess which model won)
- "The Paradox" — Opus wins 63% A/B but Sonnet scores higher on rubric criteria
- Overlap workers deep-dive (20 workers, 55% show paradox)
- Worker #9320 featured case study
- 350 stratified samples in data explorer (50 per language)

## Results Summary

### Head-to-Head (Comparative)

| Metric | Value |
|--------|-------|
| Total comparisons | 10,629 |
| Opus win rate | 63.1% |
| Equal (good) | 2,705 (25.4%) |
| Equal (bad) | 44 (0.4%) |

**By Language:**

| Language | Decided | Opus Rate |
|----------|---------|-----------|
| Hindi | 1,417 | 70.7% |
| Telugu | 1,410 | 66.6% |
| Bengali | 1,066 | 65.6% |
| Malayalam | 1,325 | 61.4% |
| Marathi | 481 | 60.9% |
| Assamese | 1,214 | 56.8% |
| Kannada | 967 | 55.2% |

### Standalone (Rubric Ratings)

| Metric | Opus | Sonnet |
|--------|------|--------|
| Trust | 86% | 86% |
| Fluency | 77% | 80% |
| Complexity | 82% | 84% |
| Code-switching | 92% | 92% |

Used for LLM judge calibration - comparing human ratings to LLM judge scores on the same responses.

### "The Paradox"

A key finding from this study: **Workers prefer Opus 63% in head-to-head comparisons, but rate Sonnet slightly higher on individual criteria.**

This is validated by analyzing the 20 workers who did both tasks:
- 11 of 20 (55%) show the paradox individually
- Featured case: Worker #9320 (Telugu) chose Opus 60% in A/B but rated Sonnet +20pp on fluency and +14pp on trust

**Possible explanations**:
1. A/B captures holistic preference that rubric criteria don't
2. Position bias in A/B (Opus shown second more often?)
3. Different cognitive mode when rating vs comparing

## Known Limitations

1. **Non-expert evaluators** - Workers are native speakers but not legal/agricultural professionals. They judge fluency and perceived trustworthiness, not domain accuracy.

2. **Single-rater design** - Each question evaluated by one person (comparative) or one person per model (standalone).

3. **No translations** - Questions are language-specific, not translated versions of the same content.

4. **Audio inaccessible** - Rich qualitative data exists but isn't yet retrievable.

## Related Files

**Source Data**:
- `/Users/james/proj/anthropic-legal-agri/README.md` - Source data documentation
- `/Users/james/proj/anthropic-legal-agri/ANALYSIS_UI_SPEC.md` - Original analysis UI spec

**Processing Scripts** (in `/Users/james/proj/weval-workspace/`):
- `___generate-comparison-samples.py` - Generate 350 stratified samples for DataExplorer
- `___regenerate-rubric-summary.py` - Generate rubric_summary.json with stratified raw samples
- `___karya-to-weval-export-v3.py` - Export to weval format
- `___merge-human-ratings-v2.py` - Merge human ratings into weval results

**Processed Data** (in `/Users/james/proj/weval-workspace/___india-multilingual/`):
- `comparative_results.json` - Aggregated A/B results
- `comparison_samples.json` - 350 stratified samples
- `rubric_summary.json` - Aggregated rubric scores
- `overlap_workers.json` - 20 overlap workers analysis
