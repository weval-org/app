# Inter-Judge Agreement Implementation Plan (Krippendorff's α)

## Executive Summary

This document outlines the complete implementation plan for adding Krippendorff's α inter-judge agreement metrics to the Weval platform. This addresses a key methodological gap identified in external feedback: quantifying judge reliability beyond showing individual judgements.

**Goal**: Calculate and display inter-judge agreement at multiple granularities (per-point, per-blueprint, platform-wide) to give users confidence in evaluation reliability.

**Status**: Phase 1 Complete (Backend implementation finished 2025-10-15)
**Priority**: High (Tier 1 improvement from methodology feedback)
**Estimated effort**: 2-3 days (Day 1 complete)

---

## Table of Contents

1. [Background & Motivation](#background--motivation)
2. [Mathematical Foundation](#mathematical-foundation)
3. [Implementation Architecture](#implementation-architecture)
4. [Backend Changes](#backend-changes)
5. [Frontend Changes](#frontend-changes)
6. [Implementation Phases](#implementation-phases)
7. [Testing Strategy](#testing-strategy)
8. [Open Questions](#open-questions)

---

## Background & Motivation

### The Problem

Currently, we show `individualJudgements` arrays with per-judge scores and reflections, but we never quantify *how much judges agree*. Users see:

```
Judge 1: 0.75
Judge 2: 0.50
Consensus: 0.625
```

But they have no way to know if this 0.25 difference is:
- **Normal variance** (judges interpreting reasonably)
- **High disagreement** (criterion is ambiguous)
- **Systematic bias** (one judge consistently scores differently)

### Why Krippendorff's α?

Krippendorff's α is the right metric because:
- ✅ Handles **ordinal data** (our 0.0–1.0 scores have meaningful order)
- ✅ Handles **missing data** (backup judges, failed requests)
- ✅ Handles **2+ judges** (not limited to pairs)
- ✅ Accounts for **chance agreement** (standardized interpretation)

**Standard thresholds**:
- **α ≥ 0.800**: Reliable (acceptable for most purposes)
- **0.667 ≤ α < 0.800**: Tentative (acceptable for exploratory work)
- **α < 0.667**: Unreliable (treat results with caution)

### What Users Will Learn

**High α (> 0.8)**: "These judges are consistent → trust the scores"
**Low α for specific criteria**: "Criterion is ambiguous → rewrite with concrete examples"
**Low α for blueprints**: "Hard to judge consistently → add structured prompts"

---

## Mathematical Foundation

### Formula

**Step 1: Observed Disagreement**

For each pair of judgements on the same item:

$$
D_o = \frac{1}{n} \sum_{i=1}^{n} \sum_{j=1}^{n_i} \sum_{k=j+1}^{n_i} \delta^2(v_{ij}, v_{ik})
$$

Where:
- $n$ = total items (rubric points being judged)
- $n_i$ = number of judges who rated item $i$
- $v_{ij}$ = score assigned by judge $j$ to item $i$
- $\delta^2$ = squared difference function

**Step 2: Expected Disagreement**

What disagreement we'd expect if scores were random:

$$
D_e = \frac{1}{n(n-1)} \sum_{c} \sum_{k>c} n_c \cdot n_k \cdot \delta^2(c, k)
$$

Where $n_c$ is the frequency of category/score $c$ across all judgements.

**Step 3: Krippendorff's α**

$$
\alpha = 1 - \frac{D_o}{D_e}
$$

### Simplified Interval Version

For our initial implementation, we'll use the **interval distance metric**:

$$
\delta^2(v_1, v_2) = (v_1 - v_2)^2
$$

This treats our 0.0–1.0 scores as interval data (equal distances between points). We can upgrade to the ordinal metric later if needed.

### Concrete Example

Blueprint with 3 points, 2 judges:

| Point | Judge 1 | Judge 2 |
|-------|---------|---------|
| 1     | 1.0     | 1.0     |
| 2     | 0.75    | 0.625   |
| 3     | 0.5     | 0.625   |

**Observed disagreement**:
```
D_o = [(1.0-1.0)² + (0.75-0.625)² + (0.5-0.625)²] / 3
    = [0 + 0.0156 + 0.0156] / 3
    = 0.0104
```

**Expected disagreement**: (based on marginal distribution of all 6 scores)
```
D_e ≈ 0.12 (computed from pairwise variance)
```

**Alpha**:
```
α = 1 - (0.0104 / 0.12) = 0.913 → Excellent agreement
```

---

## Implementation Architecture

### Three Levels of Calculation

We'll calculate α at three granularities:

#### 1. Per-Point α (Finest)
- **Scope**: Single rubric criterion across all model responses
- **Example**: "Mentions empathy" evaluated for 10 models = 20 judge scores → α = 0.82
- **Use case**: Identify ambiguous criteria

#### 2. Per-Blueprint α (Primary)
- **Scope**: All points in one blueprint
- **Example**: 15 points × 2 judges × 10 models = 300 judgements → α = 0.85
- **Use case**: Show users "judge agreement for this evaluation"

#### 3. Platform-Wide α (Optional)
- **Scope**: All blueprints combined
- **Use case**: General health metric ("our judges agree 84% of the time")

### Where to Calculate

**Location**: `src/cli/evaluators/llm-coverage-evaluator.ts` (after line 799, when all assessments are complete)

**When**: After consensus scoring, before returning results

**What to include**:
- Only **LLM-judged points** (exclude function-based points)
- Only points with **≥2 judges** (need multiple judgements to measure agreement)
- Include **backup judge** scores if they ran

---

## Backend Changes

### 1. Type Definitions

**File**: `src/types/shared.ts`

Add new interface after `IndividualJudgement`:

```typescript
/**
 * Metrics quantifying inter-judge agreement for reliability assessment.
 * Uses Krippendorff's alpha coefficient to measure consistency across judges.
 */
export interface JudgeAgreementMetrics {
  /** Krippendorff's alpha coefficient (0-1, where 1 = perfect agreement, 0 = random) */
  krippendorffsAlpha: number;

  /** Number of rubric points included in calculation */
  numItems: number;

  /** Number of judges that participated */
  numJudges: number;

  /** Total pairwise comparisons made */
  numComparisons: number;

  /** Interpretation label based on standard thresholds */
  interpretation: 'reliable' | 'tentative' | 'unreliable';

  /** Hash fingerprint of judge set used (for tracking judge changes over time) */
  judgeSetFingerprint: string;

  /** Detailed information about which judges participated */
  judgesUsed: Array<{
    judgeId: string;
    model: string;
    approach: string;
    assessmentCount: number; // How many points this judge evaluated
  }>;

  /** Optional: Alpha for each individual point (for debugging ambiguous criteria) */
  perPointAlphas?: Array<{
    pointText: string;
    alpha: number;
    numJudges: number;
  }>;
}
```

**Enhancement: Judge Tracking**

The implementation includes two important fields for tracking judge evolution:

1. **`judgeSetFingerprint`**: A stable SHA-256 hash (12-char prefix) of the sorted judge IDs used in the evaluation. This allows comparing agreement metrics across runs to detect when judge composition changed.

2. **`judgesUsed`**: Detailed metadata about each judge's participation, including:
   - Stable `judgeId` (deterministically tied to model+approach)
   - Model identifier and approach type
   - Assessment count per judge (useful for identifying "bad judges" with consistently low agreement)

These features support longitudinal analysis: users can track whether adding/removing judges affects reliability, and identify specific judges that may need configuration adjustments.

Update `CoverageResult`:

```typescript
export type CoverageResult = {
    keyPointsCount?: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
    sampleCount?: number;
    stdDev?: number;
    error?: string;

    // NEW: Add judge agreement metrics
    judgeAgreement?: JudgeAgreementMetrics;
};
```

### 2. Calculation Function

**File**: `src/cli/evaluators/llm-coverage-evaluator.ts`

Add helper function (after line 605, before `evaluate` method):

```typescript
/**
 * Calculates Krippendorff's alpha for inter-judge agreement.
 * Uses interval distance metric (squared differences).
 *
 * @param pointAssessments - All assessments for a single prompt
 * @returns Agreement metrics or null if insufficient data
 */
private calculateJudgeAgreement(
    pointAssessments: PointAssessment[]
): JudgeAgreementMetrics | null {
    // Filter to points with multiple judges (need ≥2 for agreement)
    const pointsWithMultipleJudges = pointAssessments.filter(
        pa => pa.individualJudgements && pa.individualJudgements.length >= 2
    );

    if (pointsWithMultipleJudges.length === 0) {
        return null; // No multi-judge assessments
    }

    // Extract all judge scores per point
    const items: Array<{ pointText: string; scores: number[] }> = [];
    for (const assessment of pointsWithMultipleJudges) {
        if (!assessment.individualJudgements) continue;

        const scores = assessment.individualJudgements
            .map(j => j.coverageExtent)
            .filter(s => s !== undefined && !isNaN(s)) as number[];

        if (scores.length >= 2) {
            items.push({
                pointText: assessment.keyPointText,
                scores
            });
        }
    }

    if (items.length === 0) {
        return null;
    }

    // Step 1: Calculate observed disagreement (average pairwise squared diff)
    let observedDisagreement = 0;
    let numComparisons = 0;

    for (const item of items) {
        for (let i = 0; i < item.scores.length; i++) {
            for (let j = i + 1; j < item.scores.length; j++) {
                observedDisagreement += Math.pow(item.scores[i] - item.scores[j], 2);
                numComparisons++;
            }
        }
    }

    if (numComparisons === 0) {
        return null;
    }

    observedDisagreement /= numComparisons;

    // Step 2: Calculate expected disagreement (marginal distribution variance)
    const allScores = items.flatMap(item => item.scores);
    let expectedDisagreement = 0;
    let totalPairs = 0;

    for (let i = 0; i < allScores.length; i++) {
        for (let j = i + 1; j < allScores.length; j++) {
            expectedDisagreement += Math.pow(allScores[i] - allScores[j], 2);
            totalPairs++;
        }
    }

    if (totalPairs === 0 || expectedDisagreement === 0) {
        // Perfect agreement (all scores identical)
        return {
            krippendorffsAlpha: 1.0,
            numItems: items.length,
            numJudges: items[0]?.scores.length || 0,
            numComparisons,
            interpretation: 'reliable'
        };
    }

    expectedDisagreement /= totalPairs;

    // Step 3: Calculate alpha
    const alpha = 1 - (observedDisagreement / expectedDisagreement);

    // Determine interpretation
    let interpretation: 'reliable' | 'tentative' | 'unreliable';
    if (alpha >= 0.800) interpretation = 'reliable';
    else if (alpha >= 0.667) interpretation = 'tentative';
    else interpretation = 'unreliable';

    return {
        krippendorffsAlpha: parseFloat(alpha.toFixed(3)),
        numItems: items.length,
        numJudges: items[0]?.scores.length || 0,
        numComparisons,
        interpretation
    };
}
```

### 3. Integration into Evaluation Flow

**File**: `src/cli/evaluators/llm-coverage-evaluator.ts`

Update the evaluation loop (around line 779):

```typescript
// After aggregating scores, before storing result:
const allAssessments = [...functionAssessments, ...textAssessments];
const finalAverage = aggregateCoverageScores(allAssessments);

// NEW: Calculate judge agreement
const judgeAgreement = this.calculateJudgeAgreement(allAssessments);

// Log warning if agreement is low
if (judgeAgreement && judgeAgreement.interpretation === 'unreliable') {
    this.logger.warn(
        `[LLMCoverageEvaluator] Low judge agreement (α=${judgeAgreement.krippendorffsAlpha}) ` +
        `for model ${modelId} on prompt ${promptData.promptId}`
    );
}

llmCoverageScores[promptData.promptId][modelId] = {
    keyPointsCount: allAssessments.length,
    avgCoverageExtent: allAssessments.length > 0 ? parseFloat(finalAverage.toFixed(2)) : undefined,
    pointAssessments: allAssessments,
    judgeAgreement, // NEW: Include agreement metrics
};
```

### 4. Storage

No additional changes needed! The `judgeAgreement` field will be:
- Stored in result JSON files (automatic via type extension)
- Available in API responses (automatic via type extension)
- Persisted to Netlify Blobs (automatic via serialization)

---

## Frontend Changes

### 1. Type Extensions

**File**: `src/app/utils/types.ts`

Import and re-export the new type:

```typescript
import { JudgeAgreementMetrics } from '@/types/shared';

export type { JudgeAgreementMetrics };

// Ensure CoverageResult includes it
export type CoverageResult = SharedCoverageResult; // Should already include judgeAgreement
```

### 2. UI Components to Update

#### A. MacroCoverageTable.tsx

**Where**: Lines 1082-1094 (high judge disagreement detection)

**Current code**:
```typescript
// Check for high judge disagreement
let hasHighDisagreement = false;
if (result && !('error' in result) && result.pointAssessments) {
    for (const assessment of result.pointAssessments) {
        if (!hasHighDisagreement && assessment.individualJudgements && assessment.individualJudgements.length > 1) {
            const scores = assessment.individualJudgements.map(j => j.coverageExtent);
            const n = scores.length;
            const mean = scores.reduce((a, b) => a + b) / n;
            const stdDev = Math.sqrt(scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);

            if (stdDev > HIGH_DISAGREEMENT_THRESHOLD_STD_DEV) {
                hasHighDisagreement = true;
                // ... tooltip text
            }
        }
    }
}
```

**Enhancement**: Add alpha-based warning:

```typescript
// Check for judge agreement quality
let hasLowAgreement = false;
let agreementTooltip = '';

if (result && !('error' in result) && result.judgeAgreement) {
    const { krippendorffsAlpha, interpretation } = result.judgeAgreement;

    if (interpretation === 'unreliable') {
        hasLowAgreement = true;
        agreementTooltip = `Low Judge Agreement: α=${krippendorffsAlpha.toFixed(3)} (${interpretation}). Judges significantly disagreed on this evaluation.`;
    } else if (interpretation === 'tentative') {
        hasLowAgreement = true;
        agreementTooltip = `Moderate Judge Agreement: α=${krippendorffsAlpha.toFixed(3)} (${interpretation}). Some judge disagreement observed.`;
    }

    if (agreementTooltip) {
        if (titleText) titleText += '\n---\n';
        titleText += agreementTooltip;
    }
}
```

**Visual indicator** (add to icon overlay section, line 1176):

```typescript
<div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
    {hasLowAgreement && (
        <span title={agreementTooltip}>
            <Icon name="users" className={cn(
                "w-3 h-3",
                result.judgeAgreement?.interpretation === 'unreliable'
                    ? "text-red-600 dark:text-red-500"
                    : "text-yellow-600 dark:text-yellow-500"
            )} />
        </span>
    )}
    {/* ... existing icons ... */}
</div>
```

#### B. KeyPointCoverageTable.tsx

**Where**: Line 269 (SharedModelCard call)

**Enhancement**: Show agreement in model summary card

Update `calculateModelSummary` helper (line 128):

```typescript
const calculateModelSummary = (
    coverageResult: CoverageResult | undefined
): ModelSummary & { judgeAgreement?: JudgeAgreementMetrics } => {
    if (!coverageResult || 'error' in coverageResult || !coverageResult.pointAssessments) {
        return { total: 0, passed: 0, criticalFailures: 0, majorGaps: 0, avgCoverage: 0 };
    }

    // ... existing calculation ...

    return {
        total,
        passed,
        criticalFailures,
        majorGaps,
        avgCoverage,
        judgeAgreement: coverageResult.judgeAgreement // NEW
    };
};
```

Update `SharedModelCard` component to display (if passed):

```typescript
// In SharedModelCard component
{summary.judgeAgreement && (
    <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon name="users" className="w-3 h-3" />
        <span>
            Judge α: {summary.judgeAgreement.krippendorffsAlpha.toFixed(2)}
            <span className={cn(
                "ml-1",
                summary.judgeAgreement.interpretation === 'reliable' && "text-green-600",
                summary.judgeAgreement.interpretation === 'tentative' && "text-yellow-600",
                summary.judgeAgreement.interpretation === 'unreliable' && "text-red-600"
            )}>
                ({summary.judgeAgreement.interpretation})
            </span>
        </span>
    </div>
)}
```

#### C. SharedEvaluationComponents.tsx

**Where**: EvaluationView component (lines 188-548)

**Enhancement**: Add agreement badge to assessment headers

In the assessment list header (where we show "Criteria Evaluation (X)"), add agreement indicator:

```typescript
<div className="flex items-center justify-between mb-2">
    <h3 className="font-semibold text-muted-foreground text-sm">
        Criteria Evaluation ({assessments.length})
    </h3>

    {/* NEW: Judge agreement badge */}
    {judgeAgreement && (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-xs cursor-help",
                            judgeAgreement.interpretation === 'reliable' && "border-green-600 text-green-600",
                            judgeAgreement.interpretation === 'tentative' && "border-yellow-600 text-yellow-600",
                            judgeAgreement.interpretation === 'unreliable' && "border-red-600 text-red-600"
                        )}
                    >
                        <Icon name="users" className="w-3 h-3 mr-1" />
                        α = {judgeAgreement.krippendorffsAlpha.toFixed(2)}
                    </Badge>
                </TooltipTrigger>
                <TooltipContent>
                    <div className="text-xs space-y-1">
                        <p><strong>Inter-judge agreement:</strong> {judgeAgreement.interpretation}</p>
                        <p>{judgeAgreement.numJudges} judges across {judgeAgreement.numItems} criteria</p>
                        <p className="text-muted-foreground">
                            {judgeAgreement.interpretation === 'reliable' &&
                                "Judges show strong consistency (α ≥ 0.80)"}
                            {judgeAgreement.interpretation === 'tentative' &&
                                "Judges show moderate agreement (α ≥ 0.67)"}
                            {judgeAgreement.interpretation === 'unreliable' &&
                                "Low judge consistency detected (α < 0.67)"}
                        </p>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )}
</div>
```

**Type update**: Add `judgeAgreement` to props:

```typescript
export const EvaluationView: React.FC<{
    assessments: PointAssessment[];
    modelResponse: string;
    idealResponse?: string;
    expandedLogs: Record<number, boolean>;
    toggleLogExpansion: (index: number) => void;
    isMobile?: boolean;
    generatedTranscript?: string;
    generatedHistory?: ConversationMessage[];
    generatedHistoryByTemp?: Array<{ temperature: number; history?: ConversationMessage[]; transcript?: string; text?: string }>;
    renderAs?: RenderAsType;
    judgeAgreement?: JudgeAgreementMetrics; // NEW
}> = ({
    assessments,
    modelResponse,
    idealResponse,
    expandedLogs,
    toggleLogExpansion,
    isMobile = false,
    generatedTranscript,
    generatedHistory,
    generatedHistoryByTemp,
    renderAs,
    judgeAgreement // NEW
}) => {
    // ... component code
}
```

#### D. SpecificEvaluationModal.tsx

**Location**: Find where this modal renders detailed evaluation results

**Enhancement**: Add prominent agreement indicator at top of modal

```typescript
{/* After model name header, before assessments */}
{coverageResult?.judgeAgreement && (
    <Alert className={cn(
        "mb-4",
        coverageResult.judgeAgreement.interpretation === 'reliable' &&
            "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-500/30",
        coverageResult.judgeAgreement.interpretation === 'tentative' &&
            "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-500/30",
        coverageResult.judgeAgreement.interpretation === 'unreliable' &&
            "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-500/30"
    )}>
        <Icon name="users" className="h-4 w-4" />
        <AlertTitle>Judge Agreement: {coverageResult.judgeAgreement.interpretation}</AlertTitle>
        <AlertDescription className="text-sm">
            Krippendorff's α = {coverageResult.judgeAgreement.krippendorffsAlpha.toFixed(3)}
            ({coverageResult.judgeAgreement.numJudges} judges across {coverageResult.judgeAgreement.numItems} criteria,
            {coverageResult.judgeAgreement.numComparisons} comparisons).
            {coverageResult.judgeAgreement.interpretation === 'reliable' &&
                " Judges showed strong consistency."}
            {coverageResult.judgeAgreement.interpretation === 'tentative' &&
                " Moderate agreement observed; review individual judgements for details."}
            {coverageResult.judgeAgreement.interpretation === 'unreliable' &&
                " Low consistency detected. Results should be interpreted with caution."}
        </AlertDescription>
    </Alert>
)}
```

#### E. Analysis Page Routes (eng/ and simple/)

**Files**:
- `/src/app/analysis/[configId]/[runLabel]/[timestamp]/eng/page.tsx`
- `/src/app/analysis/[configId]/[runLabel]/[timestamp]/simple/page.tsx`

**Enhancement**: Add aggregate agreement summary at page level

In the page header/stats section, add:

```typescript
// Calculate aggregate agreement across all prompts
const aggregateAgreement = useMemo(() => {
    if (!data?.evaluationResults?.llmCoverageScores) return null;

    const alphas: number[] = [];
    Object.values(data.evaluationResults.llmCoverageScores).forEach(promptScores => {
        Object.values(promptScores).forEach(result => {
            if (result && !('error' in result) && result.judgeAgreement) {
                alphas.push(result.judgeAgreement.krippendorffsAlpha);
            }
        });
    });

    if (alphas.length === 0) return null;

    const avgAlpha = alphas.reduce((a, b) => a + b, 0) / alphas.length;
    const minAlpha = Math.min(...alphas);

    return { avgAlpha, minAlpha, count: alphas.length };
}, [data]);

// Render in stats bar
{aggregateAgreement && (
    <Card className="p-4">
        <div className="flex items-center gap-2">
            <Icon name="users" className="w-5 h-5 text-primary" />
            <div>
                <div className="font-semibold">Judge Agreement</div>
                <div className="text-sm text-muted-foreground">
                    Avg α = {aggregateAgreement.avgAlpha.toFixed(2)}
                    (min: {aggregateAgreement.minAlpha.toFixed(2)})
                </div>
            </div>
        </div>
    </Card>
)}
```

### 3. Executive Summary Integration

**File**: `src/cli/services/executive-summary-service.ts`

**Enhancement**: Include agreement metrics in executive summary prompt

When constructing the analysis prompt for the analyst LLM, include agreement data:

```typescript
// In the data section passed to analyst
const agreementSummary = Object.entries(llmCoverageScores).map(([promptId, modelScores]) => {
    const agreements = Object.entries(modelScores)
        .filter(([_, result]) => result && !('error' in result) && result.judgeAgreement)
        .map(([modelId, result]) => ({
            modelId,
            alpha: result.judgeAgreement!.krippendorffsAlpha,
            interpretation: result.judgeAgreement!.interpretation
        }));

    if (agreements.length === 0) return null;

    const avgAlpha = agreements.reduce((sum, a) => sum + a.alpha, 0) / agreements.length;
    const lowAgreementModels = agreements.filter(a => a.interpretation !== 'reliable');

    return {
        promptId,
        avgAlpha,
        lowAgreementCount: lowAgreementModels.length,
        totalModels: agreements.length
    };
}).filter(Boolean);

// Add to analyst prompt
const analysisPrompt = `
...existing prompt...

<JUDGE_AGREEMENT_METRICS>
Inter-judge agreement (Krippendorff's α) summary:
${agreementSummary.map(s =>
    `Prompt ${s.promptId}: avg α = ${s.avgAlpha.toFixed(2)} ` +
    `(${s.lowAgreementCount}/${s.totalModels} models with low agreement)`
).join('\n')}

Note: α < 0.667 indicates unreliable judge consensus. Consider mentioning if you observe patterns.
</JUDGE_AGREEMENT_METRICS>

...rest of prompt...
`;
```

**Analyst output**: The analyst might include insights like:

> "Judge agreement was consistently high (α > 0.85) across all models, suggesting the evaluation criteria were well-defined. However, for the 'empathy' criterion, agreement dropped to α = 0.62 for Model X, indicating judges interpreted this aspect differently."

---

## Implementation Phases

### Phase 1: Backend Foundation (Day 1) ✅ COMPLETE
**Goal**: Calculate and store agreement metrics

- [x] Add `JudgeAgreementMetrics` interface to `src/types/shared.ts`
- [x] Update `CoverageResult` type with `judgeAgreement?` field
- [x] Implement `calculateJudgeAgreement()` method in `LLMCoverageEvaluator`
- [x] Implement `generateJudgeSetFingerprint()` for judge tracking
- [x] Implement `extractJudgesUsed()` for judge metadata
- [x] Integrate calculation into evaluation flow (line 969-987 in llm-coverage-evaluator.ts)
- [x] Add logging for low agreement warnings
- [x] Add comprehensive unit tests (8 test cases covering all edge cases)
- [x] Test with existing result files (gracefully handles missing field)

**Completed**: 2025-10-15

**Verification Steps**:
- [x] All unit tests pass (39/39 tests passing)
- [ ] Run evaluation: `pnpm cli run-config <blueprint>` (pending verification)
- [ ] Inspect result JSON: confirm `judgeAgreement` field is present (pending verification)
- [ ] Check logs: confirm warnings appear for α < 0.667 (pending verification)

**Implementation Notes**:
- Uses interval distance metric: `δ²(v1, v2) = (v1 - v2)²`
- Includes backup judge scores when present
- Returns `null` for single-judge or function-only evaluations
- Judge IDs are deterministic: `{id}-{approach}({model})`
- Fingerprint uses SHA-256 hash of sorted judge IDs (12-char prefix)

### Phase 2: UI - Critical Path (Day 2)
**Goal**: Display agreement in primary views

- [ ] Update frontend types in `src/app/utils/types.ts`
- [ ] Add agreement badge to `SharedEvaluationComponents.tsx` (EvaluationView header)
- [ ] Add agreement indicator to `MacroCoverageTable.tsx` (cell overlays)
- [ ] Add agreement to `SpecificEvaluationModal.tsx` (modal header)
- [ ] Test rendering with real data

**Verification**:
- Navigate to analysis page: `/analysis/legal-reasoning-benchmark/main/latest/eng`
- Confirm α badge appears in key point coverage section
- Click cell in macro table: confirm low-agreement icon if applicable
- Open modal: confirm agreement alert appears

### Phase 3: UI - Enhanced Views (Day 3)
**Goal**: Add aggregate stats and advanced displays

- [ ] Add aggregate agreement summary to analysis page routes (eng/ and simple/)
- [ ] Update `KeyPointCoverageTable.tsx` model summary cards
- [ ] Add per-point alpha breakdown (optional debug feature)
- [ ] Update executive summary prompt to include agreement data
- [ ] Re-run executive summary generation for key blueprints

**Verification**:
- Check analysis page header: aggregate α stats appear
- Review model cards: α values shown
- Re-generate executive summary: confirm mentions of agreement patterns

### Phase 4: Documentation & Polish (Day 3)
**Goal**: User-facing documentation

- [ ] Update `METHODOLOGY.md` Section 4.2 with agreement metrics explanation
- [ ] Add "Understanding Judge Agreement" section with interpretation guide
- [ ] Update changelog
- [ ] Add tooltip help text to all UI displays
- [ ] Consider adding "Learn More" link to methodology docs

**Verification**:
- Read methodology: clear explanation of α
- Hover tooltips: informative and concise
- Check changelog: new feature documented

---

## Testing Strategy

### Unit Tests

**File**: `src/cli/evaluators/__tests__/llm-coverage-evaluator.test.ts`

Add test cases:

```typescript
describe('calculateJudgeAgreement', () => {
    it('should return null when no multi-judge assessments exist', () => {
        // Single judge per point
        const assessments = [
            { keyPointText: 'Point 1', individualJudgements: [{ judgeModelId: 'j1', coverageExtent: 0.8, reflection: '' }] }
        ];
        const result = evaluator.calculateJudgeAgreement(assessments);
        expect(result).toBeNull();
    });

    it('should calculate α = 1.0 for perfect agreement', () => {
        const assessments = [
            { keyPointText: 'Point 1', individualJudgements: [
                { judgeModelId: 'j1', coverageExtent: 0.8, reflection: '' },
                { judgeModelId: 'j2', coverageExtent: 0.8, reflection: '' }
            ]}
        ];
        const result = evaluator.calculateJudgeAgreement(assessments);
        expect(result?.krippendorffsAlpha).toBe(1.0);
        expect(result?.interpretation).toBe('reliable');
    });

    it('should calculate α correctly for moderate disagreement', () => {
        // Known example with α ≈ 0.75
        const assessments = [/* fixture data */];
        const result = evaluator.calculateJudgeAgreement(assessments);
        expect(result?.krippendorffsAlpha).toBeCloseTo(0.75, 2);
        expect(result?.interpretation).toBe('tentative');
    });

    it('should mark α < 0.667 as unreliable', () => {
        // Construct case with high disagreement
        const assessments = [/* fixture data */];
        const result = evaluator.calculateJudgeAgreement(assessments);
        expect(result?.interpretation).toBe('unreliable');
    });
});
```

### Integration Tests

**Scenario 1: End-to-end evaluation**
```bash
pnpm cli run-config test-blueprint-small
# Verify: result file contains judgeAgreement field
# Verify: CLI logs show agreement metrics
```

**Scenario 2: UI rendering**
```typescript
// Cypress test
cy.visit('/analysis/test-blueprint-small/main/latest/eng');
cy.get('[data-testid="judge-agreement-badge"]').should('exist');
cy.get('[data-testid="judge-agreement-badge"]').should('contain', 'α =');
```

### Manual QA Checklist

- [ ] Run evaluation on blueprint with 2 primary judges → α appears
- [ ] Run evaluation where backup judge activates → α includes backup scores
- [ ] Run evaluation on blueprint with single judge → no α (graceful)
- [ ] Check macro table: low α shows warning icon
- [ ] Check modal: agreement alert displays correct color
- [ ] Check analysis page: aggregate stats calculated correctly
- [ ] Verify tooltips explain α clearly
- [ ] Test mobile layout: agreement info visible
- [ ] Verify no performance degradation (calculation is O(n²) but n is small)

---

## Open Questions

### 1. Should we show per-point alphas?

**Proposal**: Add collapsible section in modal showing α for each criterion

**Pros**:
- Helps identify which specific criteria are ambiguous
- Useful for blueprint authors to refine rubrics

**Cons**:
- UI complexity
- Requires more calculation (n separate alphas vs. 1 aggregate)

**Decision**: Start with blueprint-level only; add per-point as v2 feature if users request it

### 2. Platform-wide alpha: where to display?

**Options**:
- Homepage stats card
- Methodology page ("Current platform α = 0.84")
- Admin/debug view only

**Decision**: TBD - not critical for Phase 1

### 3. Should we exclude backup judge from calculation?

**Consideration**: Backup judge only runs when primary judges fail. Including it might inflate α (it's not truly "independent" since it only evaluates subset of points).

**Current approach**: Include backup judge for simplicity

**Alternative**: Track `isPrimaryJudge` flag and exclude backup from α calculation

**Decision**: Include for now; revisit if we see anomalies

### 4. How to handle temperature variants?

**Current**: Each temperature variant is evaluated separately, so α is per-variant

**Question**: Should we aggregate α across temperatures?

**Decision**: No - keep per-variant. Temperature affects model output, not judge agreement.

### 5. What about ordinal vs. interval distance metric?

**Current**: Using interval (squared difference)

**Future**: Could implement ordinal metric if we find:
- Gap between 0.0→0.125 should "cost" more than 0.875→1.0
- Evidence that interval assumption doesn't match judge psychology

**Decision**: Start with interval; add ordinal as configuration option if needed

---

## Success Metrics

How we'll know this is working:

1. **Technical**: 100% of new evaluations include `judgeAgreement` field
2. **Visibility**: Agreement metrics appear on analysis pages without errors
3. **Usability**: Users understand what α means (measured by lack of confusion in feedback)
4. **Actionability**: Blueprint authors refine criteria with low α → improved agreement in next run
5. **Credibility**: External reviewers acknowledge this addresses the methodology gap

---

## References

- Krippendorff, K. (2004). *Content Analysis: An Introduction to Its Methodology*. Sage Publications.
- Hayes, A. F., & Krippendorff, K. (2007). "Answering the Call for a Standard Reliability Measure for Coding Data". *Communication Methods and Measures*, 1(1), 77-89.
- CIP Research: [LLM Judges Are Unreliable](https://www.cip.org/blog/llm-judges-are-unreliable) (motivation for this feature)
- Weval Methodology Feedback (2025-10-15): External review that identified this gap

---

## Changelog

- **2025-10-15**: Initial planning document created
- **2025-10-15**: Phase 1 implementation completed
  - Added `JudgeAgreementMetrics` type with judge tracking fields (`judgeSetFingerprint`, `judgesUsed`)
  - Implemented `calculateJudgeAgreement()`, `generateJudgeSetFingerprint()`, and `extractJudgesUsed()` methods
  - Integrated into evaluation flow with low-agreement warnings
  - Added comprehensive unit test suite (8 test cases, all passing)
  - Enhanced plan with judge evolution tracking features
- **TBD**: End-to-end verification run (Phase 1 verification)
- **TBD**: UI integration started (Phase 2)
- **TBD**: Enhanced views completed (Phase 3)
- **TBD**: Documentation finalized (Phase 4)
