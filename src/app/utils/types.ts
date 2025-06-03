// Analysis results per prompt
interface PromptStats {
    promptId: string;
    promptText: string;
    averageSimilarity: number | null;
    similarityScores: number[];
    pairCount: number;
    promptStatistics?: PromptAnalysisResults;
    allResponses?: Record<string, Record<string, string>>;
}

// Overall prompt analysis results
interface PromptAnalysisResults {
  mostConsistentPrompt: PromptStats | null;
  mostDiversePrompt: PromptStats | null;
  allPromptStats: Record<string, PromptStats>;
}

// Individual prompt similarity data structure
interface PromptSimilarity {
  promptId: string
  promptText: string
  modelA: string
  modelB: string
  similarity: number
  excludedModels?: string[];
}

// Structure for per-prompt similarities on the Frontend
interface PerPromptSimilaritiesFE {
  [promptId: string]: { // For each prompt
    [modelA: string]: { // For each model A
      [modelB: string]: number; // Similarity to model B
    };
  };
}

// Embedding evaluation results within the main data structure
interface EmbeddingEvaluationResult {
    similarityMatrix?: Record<string, Record<string, number>>; // Overall average similarity
    perPromptSimilarities?: PerPromptSimilaritiesFE; // Use the FE type here
}

// LLM coverage evaluation results within the main data structure
interface LLMCoverageEvaluationResult {
    llmCoverageScores?: any; // Define more strictly later if needed
}

// Main data structure for the comparison results (V2)
interface ComparisonDataV2 {
  configId: string;
  configTitle: string;
  runLabel: string;
  timestamp: string;
  description?: string;
  config: ConfigData;
  evalMethodsUsed: string[];
  effectiveModels: string[];
  modelSystemPrompts?: Record<string, string | null>;
  promptIds: string[];
  promptTexts?: Record<string, string>;
  extractedKeyPoints?: Record<string, string[]>;
  allResponses?: Record<string, Record<string, string>>;
  errors?: Record<string, Record<string, string>>;
  evaluationResults: EmbeddingEvaluationResult & LLMCoverageEvaluationResult & {
    perModelHybridScores?: Map<string, { average: number | null; stddev: number | null }> | Record<string, { average: number | null; stddev: number | null }>;
    perModelSemanticScores?: Map<string, { average: number | null; stddev: number | null }> | Record<string, { average: number | null; stddev: number | null }>;
    overallAverageCoverageStats?: { average: number | null; stddev: number | null } | null;
    overallAverageHybridScore?: number | null;
    overallHybridScoreStdDev?: number | null;
  };
  promptStatistics?: PromptAnalysisResults;
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
    promptText: string;
    idealResponse?: string;
    system?: string | null;
    points?: string[];
    temperature?: number;
}

// --- Types for Modal state ---

// Coverage Score data used within the modal
interface LLMCoverageScoreData {
    keyPointsCount: number;
    coveredCount: number;
    score: number;
    avgCoverageExtent?: number;
}

// Detailed assessment for a single key point
interface PointAssessment {
    keyPointText: string;
    llmReturnedKeyPointText?: string;
    isPresent: boolean;
    coverageExtent?: number;
}

// Type for a coverage result, which could be data, an error, or null
type CoverageResult = (LLMCoverageScoreData & { pointAssessments?: PointAssessment[] }) | { error: string } | null;

// Information needed for the ResponseComparisonModal
interface SelectedPairInfo {
    modelA: string;
    modelB: string;
    promptId: string;
    promptText: string;
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

// Make types available for import
export type {
  PromptStats,
  PromptAnalysisResults,
  PromptSimilarity,
  PerPromptSimilaritiesFE,
  EmbeddingEvaluationResult,
  LLMCoverageEvaluationResult,
  ComparisonDataV2,
  LLMCoverageScoreData,
  PointAssessment,
  CoverageResult,
  SelectedPairInfo
};

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
} 