"use client";

// Analysis results per prompt
export interface PromptStats {
    promptId: string;
    promptText: string;
    averageSimilarity: number | null;
    similarityScores: number[];
    pairCount: number;
    allResponses?: Record<string, Record<string, string>>;
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

// Embedding evaluation results within the main data structure
export interface EmbeddingEvaluationResult {
    similarityMatrix?: Record<string, Record<string, number>> | null;
    perPromptSimilarities?: Record<string, Record<string, Record<string, number>>> | null;
    // Add other embedding-specific results if any
}

// LLM coverage evaluation results within the main data structure
export interface LLMCoverageEvaluationResult {
    llmCoverageScores?: Record<string, Record<string, CoverageResult>>;
}

// Added for multi-turn conversation support
export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// Main data structure for the comparison results (V2)
export interface ComparisonDataV2 {
  configId: string;
  configTitle: string;
  runLabel: string;
  timestamp: string;
  description?: string;
  sourceCommitSha?: string; // Link to the commit of the config file
  config: ConfigData;
  evalMethodsUsed: string[];
  effectiveModels: string[];
  modelSystemPrompts?: Record<string, string | null>;
  promptIds: string[];
  promptContexts?: Record<string, string | ConversationMessage[]>;
  extractedKeyPoints?: Record<string, string[]>;
  allFinalAssistantResponses?: Record<string, Record<string, string>>;
  fullConversationHistories?: Record<string, Record<string, ConversationMessage[]>>;
  errors?: Record<string, Record<string, string>>;
  evaluationResults?: EvaluationResults;
  excludedModels?: string[];
}

export interface ConfigData {
    configId: string;
    configTitle: string;
    id?: string;
    title?: string;
    description?: string;
    models: string[];
    systemPrompt?: string | null;
    concurrency?: number;
    temperature?: number;
    prompts: ConfigPromptData[];
    tags?: string[];
}

export interface ConfigPromptData {
    id: string;
    promptText?: string;
    messages?: ConversationMessage[];
    idealResponse?: string;
    system?: string | null;
    points?: PointDefinition[];
    temperature?: number;
}

// New: PointFunctionDefinition for config if not already present
export type PointFunctionArgs = any;
export type PointFunctionDefinition = [string, PointFunctionArgs];
export type PointDefinition = string | PointFunctionDefinition;

// Coverage Score data used within the modal (and also as part of CoverageResult)
export interface LLMCoverageScoreData {
    keyPointsCount: number;
    avgCoverageExtent?: number;
}

// IndividualJudgement interface
export interface IndividualJudgement {
    judgeModelId: string;
    coverageExtent: number;
    reflection: string;
}

// Detailed assessment for a single key point - ALIGNED WITH BACKEND
export interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
    multiplier?: number;
    citation?: string;
    judgeModelId?: string;
    judgeLog?: string[];
    individualJudgements?: IndividualJudgement[];
}

// Type for a coverage result, which could be data, an error, or null
// This combines the summary (LLMCoverageScoreData) and the details (PointAssessment[])
// It matches the backend's CoverageResult structure for llmCoverageScores
export type CoverageResult = (LLMCoverageScoreData & { pointAssessments?: PointAssessment[] }) | { error: string } | null;

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

export interface EvaluationResults {
    similarityMatrix?: Record<string, Record<string, number>>;
    perPromptSimilarities?: Record<string, Record<string, Record<string, number>>>; // PromptID -> ModelA -> ModelB -> Score
    llmCoverageScores?: Record<string, Record<string, CoverageResult>>; // PromptID -> ModelID -> CoverageResult
    // Allow perModelHybridScores to be a Map in memory or an object when serialized
    perModelHybridScores?: Map<string, { average: number | null; stddev: number | null }> | Record<string, { average: number | null; stddev: number | null }>;
    perModelSemanticScores?: Map<string, { average: number | null; stddev: number | null }> | Record<string, { average: number | null; stddev: number | null }>;
    overallAverageCoverageStats?: { average: number | null; stddev: number | null } | null;
    overallAverageHybridScore?: number | null;
    overallHybridScoreStdDev?: number | null;
    promptStatistics?: PromptAnalysisResults;
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
