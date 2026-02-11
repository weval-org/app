"use client";
import {
    ConversationMessage,
    CoverageResult,
    PointAssessment,
    IndividualJudgement,
    JudgeAgreementMetrics,
    WevalResult as ComparisonDataV2, // Alias for local consistency
    WevalConfig as ConfigData, // Alias for local consistency
    WevalPromptConfig as ConfigPromptData, // Alias for local consistency
    PointDefinition,
    WevalEvaluationResults,
    HumanRatings,
    HumanLLMAgreement,
    CriterionAgreement,
    HumanLLMDisagreement,
} from '@/types/shared';

// Re-exporting aliases for local consistency
export type {
    ComparisonDataV2,
    ConfigData,
    ConfigPromptData,
    PointDefinition,
    CoverageResult,
    PointAssessment,
    IndividualJudgement,
    JudgeAgreementMetrics,
    HumanRatings,
    HumanLLMAgreement,
    CriterionAgreement,
    HumanLLMDisagreement,
};

// Analysis results per prompt
export interface PromptStats {
    promptId: string;
    promptText: string;
    averageSimilarity: number | null;
    similarityScores: number[];
    pairCount: number;
    allResponses?: Record<string, Record<string, string>>;
    allPromptStats: Record<string, PromptStats>;
}

// Overall prompt analysis results (e.g., for consistency/diversity across all prompts)
export interface PromptAnalysisResults {
  mostConsistentPrompt: PromptStats | null;
  mostDiversePrompt: PromptStats | null;
  allPromptStats: Record<string, PromptStats>;
}

// Individual prompt similarity data structure
export interface PromptSimilarity {
  promptId: string
  promptText: string
  modelA: string
  modelB: string
  similarity: number
  excludedModels?: string[];
}

// Structure for per-prompt similarities on the Frontend
export interface PerPromptSimilaritiesFE {
  [promptId: string]: { // For each prompt
    [modelA: string]: { // For each model A
      [modelB: string]: number; // Similarity to model B
    };
  };
}

// Point function arg shapes are defined in shared types; re-export convenient alias here if needed
export type PointFunctionDefinition = [string, unknown];
// PointDefinition is now imported from shared.ts

// The frontend-specific, enriched evaluation results, which includes calculated stats.
export interface EvaluationResults extends WevalEvaluationResults {
    perModelHybridScores?: Map<string, { average: number | null; stddev: number | null }> | Record<string, { average: number | null; stddev: number | null }>;
    perModelSemanticScores?: Map<string, { average: number | null; stddev: number | null }> | Record<string, { average: number | null; stddev: number | null }>;
    overallAverageCoverageStats?: { average: number | null; stddev: number | null } | null;
    overallAverageHybridScore?: number | null;
    overallHybridScoreStdDev?: number | null;
    promptStatistics?: PromptAnalysisResults;
}

// Information needed for the ResponseComparisonModal
export interface SelectedPairInfo {
    modelA: string;
    modelB: string;
    promptId: string;
    promptContext: string | ConversationMessage[];
    systemPromptA?: string | null;
    systemPromptB?: string | null;
    responseA: string;
    responseB: string;
    llmCoverageScoreA?: CoverageResult; // Coverage score for model A vs Ideal
    llmCoverageScoreB?: CoverageResult; // Coverage score for model B vs Ideal
    extractedKeyPoints?: string[] | null;
    pointAssessmentsA?: PointAssessment[] | null; // Detailed points for model A vs Ideal
    pointAssessmentsB?: PointAssessment[] | null; // Detailed points for model B vs Ideal
    semanticSimilarity?: number | null;
    performanceSimilarity?: number | null;
}

// Add ComparisonRunInfo interface definition is already exported
export interface ComparisonRunInfo {
  label: string;
  timestamp: string;
  originalFilenameTimestamp: string;
  description?: string;
  numPrompts?: number;
  numModels?: number;
  hybridScoreStats?: { average: number | null; stddev: number | null };
}

// Data for individual prompt analysis (e.g., word counts, char counts per prompt)
// Renamed from PromptAnalysisResults to avoid conflict
export interface PromptAggregatedStats {
    [promptId: string]: {
        averageWordCount?: number;
        averageCharacterCount?: number;
        // ... any other per-prompt aggregated stats
    };
}
