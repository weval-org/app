// This file is the single source of truth for types shared between the
// frontend (Next.js app) and the backend (CLI, evaluators, services).
// By centralizing them here, we prevent type duplication and inconsistencies.

import { CustomModelDefinition } from "../lib/llm-clients/types";

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
    content: string | null;
}

// Corresponds to the detailed evaluation for a single rubric item.
// This is the canonical definition used by both backend and frontend.
export interface IndividualJudgement {
    judgeModelId: string;
    coverageExtent: number;
    reflection: string;
}

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
    interpretation: 'reliable' | 'tentative' | 'unreliable' | 'unstable';

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

export interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    /**
     * Standard deviation of coverageExtent across temperature permutations (if aggregated).
     */
    stdDev?: number;
    /**
     * Number of temperature samples aggregated into coverageExtent.
     */
    sampleCount?: number;
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

/**
 * Human evaluation ratings from external sources (e.g., Karya platform).
 * Used for comparison with LLM judge scores.
 */
export interface HumanRatings {
    trust?: number;
    fluency?: number;
    complexity?: number;
    code_switching?: number;
    composite?: number;
    workerReliabilityTier?: 'high' | 'medium' | 'low' | 'unknown';
    workerReliabilityScore?: number | null;
    raw?: Record<string, string>;  // Original categorical ratings
}

// A container for the results of an llm-coverage evaluation for a single
// (prompt, model) pair.
export type CoverageResult = {
    keyPointsCount?: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
    // Optional aggregate stats across temperatures or judges
    sampleCount?: number;
    stdDev?: number;
    error?: string;
    // Inter-judge agreement metrics (Krippendorff's alpha)
    judgeAgreement?: JudgeAgreementMetrics;
    // Human evaluation ratings (for human-LLM comparison studies)
    humanRatings?: HumanRatings;
    // Per-criterion LLM scores mapped to human criteria
    llmCriterionScores?: Record<string, number>;
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

/**
 * Per-criterion agreement metrics between human and LLM judges.
 */
export interface CriterionAgreement {
    correlation: number | null;
    meanDiff: number;
    humanMean: number;
    llmMean: number;
    n: number;
}

/**
 * A specific disagreement case between human and LLM judges.
 */
export interface HumanLLMDisagreement {
    prompt_id: string;
    model_id: string;
    criterion: string;
    human: number;
    llm: number;
    diff: number;
    workerReliabilityTier?: 'high' | 'medium' | 'low' | 'unknown';
    workerReliabilityScore?: number | null;
}

/**
 * Data quality metrics for human evaluation data.
 */
export interface DataQuality {
    workerReliability?: {
        total_workers?: number;
        high_reliability?: number;
        medium_reliability?: number;
        low_reliability?: number;
        thresholds?: {
            high?: number;
            medium?: number;
        };
    };
    methodology?: {
        variance_weight?: number;
        consistency_weight?: number;
        model_diff_weight?: number;
        domain_diff_weight?: number;
        description?: string;
    };
    ratingsByTier?: {
        high?: number;
        all?: number;
    };
    keyInsights?: Array<{
        finding: string;
        humanMeanHighRel?: number | null;
        llmMean?: number | null;
        gap?: number | null;
        zeroFluencyCount?: number;
        disagreementRate?: number;
    }>;
}

/**
 * Aggregate human vs LLM agreement metrics for a run.
 */
export interface HumanLLMAgreement {
    perCriterion: Record<string, CriterionAgreement>;
    overall: {
        correlation: number | null;
        meanDiff: number;
        totalComparisons: number;
        disagreementCount: number;
        disagreementRate: number;
    };
    disagreements: HumanLLMDisagreement[];
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
    citation?: string | { title?: string; name?: string; url?: string };
    /**
     * Relative importance of this prompt when aggregating scores across prompts.
     * Defaults to 1.0. Valid range: [0.1, 10].
     */
    weight?: number;
    render_as?: 'markdown' | 'html' | 'plaintext';
    // If true, force a fresh generation for this prompt regardless of global cache flag
    noCache?: boolean;
    // Tool-use evaluation constraints (trace-only)
    requiredTools?: string[];
    prohibitedTools?: string[];
    maxCalls?: number;
}

// --- Tool-use (trace-only) types ---
export interface ToolDefinition {
    name: string;
    description?: string;
    schema?: any; // JSON Schema for arguments (optional but recommended)
}

export interface ToolUsePolicy {
    enabled?: boolean; // default false
    mode?: 'trace-only'; // reserved for future modes; currently only 'trace-only'
    maxSteps?: number; // maximum allowed tool-call lines expected from model
    outputFormat?: 'json-line'; // current protocol: TOOL_CALL {json}
}

// --- External Service Types (for $call point function) ---

/**
 * Configuration for an external HTTP service that performs evaluation.
 * Services receive the response text and custom parameters, return {score, explain}.
 */
export interface ExternalServiceConfig {
    /** The HTTP endpoint URL */
    url: string;

    /** HTTP method (default: POST) */
    method?: 'GET' | 'POST' | 'PUT';

    /** HTTP headers (supports ${ENV_VAR} substitution) */
    headers?: Record<string, string>;

    /** Request timeout in milliseconds (default: 30000) */
    timeout_ms?: number;

    /** Whether to cache responses (default: true) */
    cache?: boolean;

    /** Number of retry attempts on failure (default: 2) */
    max_retries?: number;

    /** Backoff multiplier for retries in ms (default: 1000) */
    retry_backoff_ms?: number;
}

/**
 * Standard request body sent to external services.
 */
export interface ExternalServiceRequest {
    /** The model's response text being evaluated */
    response: string;

    /** ID of the model that generated the response */
    modelId: string;

    /** ID of the prompt being evaluated */
    promptId: string;

    /** User-defined parameters (from blueprint) */
    [key: string]: any;
}

/**
 * Standard response format expected from external services.
 */
export interface ExternalServiceResponse {
    /** Evaluation score (0.0 to 1.0) - REQUIRED */
    score: number;

    /** Explanation of the score - OPTIONAL */
    explain?: string;

    /** Error message if evaluation failed - OPTIONAL */
    error?: string;

    /** Any additional metadata (preserved but not used in scoring) */
    [key: string]: any;
}

export interface WevalConfig {
    configId?: string;
    configTitle?: string;
    id?: string;
    title?: string;
    description?: string;
    /**
     * Optional author attribution for the blueprint.
     * Can be a simple string (name) or an object with name/url/image_url.
     */
    author?: string | { name: string; url?: string; image_url?: string };
    point_defs?: Record<string, string>; // Reusable point function definitions
    models: (string | CustomModelDefinition)[];
    system?: string | null;
    systemPrompt?: string | null;
    systems?: (string | null)[];
    concurrency?: number;
    temperature?: number;
    temperatures?: number[];
    prompts: WevalPromptConfig[];
    tags?: string[];
    embeddingModel?: string; // Add it here
    evaluationConfig?: {
        'llm-coverage'?: LLMCoverageEvaluationConfig;
    }
    // Tool-use (trace-only) config
    tools?: ToolDefinition[];
    toolUse?: ToolUsePolicy;
    // Optional static context for prompts (e.g., frozen corpus). Shape is user-defined.
    context?: Record<string, unknown>;
    render_as?: 'markdown' | 'html' | 'plaintext';
    // If true, sets default caching behavior for all prompts. Overridden by per-prompt noCache
    noCache?: boolean;
    // External HTTP services for evaluation (e.g., fact-checking, code execution)
    externalServices?: {
        [serviceName: string]: ExternalServiceConfig;
    };
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
    article?: WevalArticle;
    humanLLMAgreement?: HumanLLMAgreement;
}

// New structured executive summary types
export interface StructuredInsights {
    keyFindings: string[];
    strengths: string[];
    weaknesses: string[];
    patterns: string[];
    grades?: ModelGrades[];
    autoTags?: string[];
}

export interface ModelGrades {
    modelId: string;
    grades: {
        adherence: number | null;
        clarity: number | null;
        tone: number | null;
        depth: number | null;
        coherence: number | null;
        helpfulness: number | null;
        credibility: number | null;
        empathy: number | null;
        creativity: number | null;
        safety: number | null;
        argumentation: number | null;
        efficiency: number | null;
        humility: number | null;
    };
    reasoning?: {
        adherence?: string;
        clarity?: string;
        tone?: string;
        depth?: string;
        coherence?: string;
        helpfulness?: string;
        credibility?: string;
        empathy?: string;
        creativity?: string;
        safety?: string;
        argumentation?: string;
        efficiency?: string;
        humility?: string;
    };
}

export interface ExecutiveSummary {
    modelId: string;
    content: string;
    structured?: StructuredInsights; // New: parsed structured data
    isStructured?: boolean; // Flag to indicate if this uses structured format
}

// Narrative article written by an analyst LLM (data journalism style)
export interface WevalArticle {
    modelId: string; // summarizer model id used
    title: string;
    deck?: string; // short subhead/tagline
    content: string; // markdown body; may contain <ref /> tags for linkification
    isStructured?: boolean; // reserved; articles are markdown-first
    meta?: {
        readingTimeMin?: number;
        version?: string;
    };
}

// Judge configuration for llm-coverage evaluation
export interface Judge {
    id?: string; // Optional identifier for a specific judge configuration
    model: string;
    approach: 'standard' | 'prompt-aware' | 'holistic';
}

// Public config type for llm-coverage evaluation (shared)
export interface LLMCoverageEvaluationConfig {
    judgeModels?: string[]; // Backwards compatibility
    judgeMode?: 'failover' | 'consensus'; // Backwards compatibility
    judges?: Judge[];
    useExperimentalScale?: boolean; // Use 9-point classification scale instead of 5-point
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

export interface PainPoint {
    configId: string;
    configTitle: string;
    runLabel: string;
    timestamp: string;
    promptId: string;
    promptContext: any; // string | ConversationMessage[]
    modelId: string;
    responseText: string;
    coverageScore: number;
    failedCriteria: {
        criterion: string;
        score: number | null;
        weight: number;
        reflection: string | null;
    }[];
}

export interface PainPointsSummary {
    painPoints: PainPoint[];
    generatedAt: string;
}

export interface RedlinesAnnotation {
    configId: string;
    runLabel: string;
    timestamp: string;
    promptId: string;
    modelId: string;
    responseHash: string;
    responseText: string;
    
    // XML-based format fields
    annotatedResponse: string; // Response text with inline <praise>/<deficit> tags
    additionalIssues: Array<{ content: string; point?: string }>; // Deficits not tied to specific spans
    
    rubricPoints: string[];
    llm: { modelId: string; temperature: number };
    createdAt: string;
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
    // Fixture metadata
    fixtureUsed?: boolean;
    fixtureSource?: 'final' | 'turns';
    // Trace-only tool calls extracted from assistant content
    toolCalls?: { name: string; arguments: any }[];
    // Sequential generation metadata (when assistant:null placeholders are used)
    generatedAssistantIndices?: number[];
    generatedAssistantTexts?: string[];
}; 