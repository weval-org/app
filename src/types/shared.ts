// This file is the single source of truth for types shared between the
// frontend (Next.js app) and the backend (CLI, evaluators, services).
// By centralizing them here, we prevent type duplication and inconsistencies.

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
    content: string;
}

// Corresponds to the detailed evaluation for a single rubric item.
// This is the canonical definition used by both backend and frontend.
export interface IndividualJudgement {
    judgeModelId: string;
    coverageExtent: number;
    reflection: string;
}

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
    isInverted?: boolean;
    pathId?: string; // Used for alternative paths (OR logic)
}

// A container for the results of an llm-coverage evaluation for a single
// (prompt, model) pair.
export type CoverageResult = {
    keyPointsCount?: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
    error?: string;
} | null;

export type EvaluationMethod = 'embedding' | 'llm-coverage';

export interface SimilarityScore {
    [modelA: string]: {
        [modelB: string]: number;
    };
}

export interface LLMCoverageScores {
    [promptId:string]: {
        [modelId: string]: CoverageResult;
    };
}

export interface WevalEvaluationResults {
    similarityMatrix?: SimilarityScore;
    perPromptSimilarities?: Record<string, SimilarityScore>;
    llmCoverageScores?: LLMCoverageScores;
    promptStatistics?: any;
    perModelHybridScores?: any;
    perModelSemanticScores?: any;
}

type AtLeastNOfArg = [number, string[]];
type PointFunctionArgs = string | number | boolean | null | (string | number | boolean)[] | AtLeastNOfArg | Record<string, unknown>;

// A single point definition - can be a simple string, a function call tuple, or a rich object.
export type SinglePointDefinition =
    string |
    [string, PointFunctionArgs] |
    {
        text?: string;
        fn?: string;
        fnArgs?: PointFunctionArgs;
        arg?: any; // Alias for fnArgs
        multiplier?: number;
        citation?: string;
        [key: string]: any;
    };

// A Point can be a single point or an array of points (representing an alternative path).
// This supports the OR logic where each inner array represents an alternative path.
export type PointDefinition = SinglePointDefinition | SinglePointDefinition[];

export interface WevalPromptConfig {
    id: string;
    description?: string;
    messages?: ConversationMessage[];
    promptText?: string;
    points?: PointDefinition[];
    should_not?: PointDefinition[];
    idealResponse?: string | null;
    system?: string | null;
    temperature?: number;
    citation?: string;
}

export interface WevalConfig {
    configId?: string;
    configTitle?: string;
    id?: string;
    title?: string;
    description?: string;
    models: string[];
    system?: string | null;
    systemPrompt?: string | null;
    systems?: (string | null)[];
    concurrency?: number;
    temperature?: number;
    temperatures?: number[];
    prompts: WevalPromptConfig[];
    tags?: string[];
    evaluationConfig?: {
        'llm-coverage'?: {
            judgeModels?: string[];
            judgeMode?: 'failover' | 'consensus';
        }
    }
}

export interface WevalResult {
    configId: string;
    configTitle: string;
    runLabel: string;
    timestamp: string;
    description?: string;
    sourceCommitSha?: string;
    sourceBlueprintFileName?: string;
    config: WevalConfig;
    evalMethodsUsed: EvaluationMethod[];
    effectiveModels: string[];
    modelSystemPrompts?: Record<string, string | null>;
    promptIds: string[];
    promptContexts?: Record<string, string | ConversationMessage[]>;
    extractedKeyPoints?: Record<string, string[]>;
    allFinalAssistantResponses?: Record<string, Record<string, string>>;
    fullConversationHistories?: Record<string, Record<string, ConversationMessage[]>>;
    errors?: Record<string, Record<string, string>>;
    evaluationResults: WevalEvaluationResults;
    excludedModels?: string[];
    executiveSummary?: ExecutiveSummary;
}

// New structured executive summary types
export interface StructuredInsights {
    keyFindings: string[];
    strengths: string[];
    weaknesses: string[];
    patterns: string[];
    grades?: ModelGrades[];
}

export interface ModelGrades {
    modelId: string;
    grades: {
        adherence: number;
        clarity: number;
        tone: number;
        depth: number;
        coherence: number;
        helpfulness: number;
        credibility: number;
        empathy: number;
        creativity: number;
        safety: number;
        argumentation: number;
        efficiency: number;
    };
}

export interface ExecutiveSummary {
    modelId: string;
    content: string;
    structured?: StructuredInsights; // New: parsed structured data
    isStructured?: boolean; // Flag to indicate if this uses structured format
}

// --- New Types for Model-Specific Summaries ---

export interface ModelRunPerformance {
  configId: string;
  configTitle: string;
  runLabel: string;
  timestamp: string;
  hybridScore: number | null;
}

export interface ModelStrengthsWeaknesses {
  topPerforming: {
    configId: string;
    configTitle: string;
    score: number;
  }[];
  weakestPerforming: {
    configId: string;
    configTitle: string;
    score: number;
  }[];
}

export interface ModelSummary {
  modelId: string; // The base model ID, e.g., openai:gpt-4o-mini
  displayName: string;
  provider: string;
  
  overallStats: {
    averageHybridScore: number | null;
    totalRuns: number;
    totalBlueprints: number;
  };

  strengthsAndWeaknesses: ModelStrengthsWeaknesses;
  
  runs: ModelRunPerformance[];
  
  lastUpdated: string;
}

export interface RunLabelStats {
    totalRuns: number;
    latestRunTimestamp: string;
    // other stats...
}

export type ModelResponseDetail = {
    finalAssistantResponseText: string;
    fullConversationHistory?: ConversationMessage[];
    systemPromptUsed: string | null;
    hasError: boolean;
    errorMessage?: string;
}; 