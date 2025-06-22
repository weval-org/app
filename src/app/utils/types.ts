"use client";
import {
    ConversationMessage,
    CoverageResult,
    PointAssessment,
    IndividualJudgement,
    WevalResult as ComparisonDataV2, // Alias for local consistency
    WevalConfig as ConfigData, // Alias for local consistency
    WevalPromptConfig as ConfigPromptData, // Alias for local consistency
    PointDefinition,
    WevalEvaluationResults,
} from '@/types/shared';

// Re-exporting aliases for local consistency
export type {
    ComparisonDataV2,
    ConfigData,
    ConfigPromptData,
    PointDefinition,
    CoverageResult,
    PointAssessment,
    IndividualJudgement
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

// Embedding evaluation results within the main data structure - Deprecated by WevalEvaluationResults
/*
export interface EmbeddingEvaluationResult {
    similarityMatrix?: Record<string, Record<string, number>> | null;
    perPromptSimilarities?: Record<string, Record<string, Record<string, number>>> | null;
    // Add other embedding-specific results if any
}
*/

// LLM coverage evaluation results within the main data structure - Deprecated by WevalEvaluationResults
/*
export interface LLMCoverageEvaluationResult {
    llmCoverageScores?: Record<string, Record<string, CoverageResult>>;
}
*/

// Main data structure for the comparison results (V2) - Now aliased from shared.ts
/*
export interface ComparisonDataV2 {
...
}
*/

// ConfigData - Now aliased from shared.ts
/*
export interface ConfigData {
...
}
*/

// ConfigPromptData - Now aliased from shared.ts
/*
export interface ConfigPromptData {
...
}
*/

export type PointFunctionArgs = any;
// PointFunctionDefinition is now just an alias for a tuple in the shared PointDefinition type
export type PointFunctionDefinition = [string, PointFunctionArgs];
// PointDefinition is now imported from shared.ts
/*
export type PointDefinition = string | PointFunctionDefinition;
*/

// Coverage Score data used within the modal (and also as part of CoverageResult)
export interface LLMCoverageScoreData {
    keyPointsCount: number;
    avgCoverageExtent?: number;
}

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
