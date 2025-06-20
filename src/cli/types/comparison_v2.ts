/* eslint-disable @typescript-eslint/no-explicit-any */
import { IDEAL_MODEL_ID } from '../../app/utils/comparisonUtils';

export type EvaluationMethod = 'embedding' | 'llm-coverage';

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// A Point can be a simple string, a function call tuple, or a rich object.
export type PointDefinition =
    string |
    [string, any] |
    {
        text?: string;
        fn?: string;
        fnArgs?: any;
        arg?: any; // Alias for fnArgs
        multiplier?: number;
        citation?: string;
        // This is the key part for the new syntax. It allows any other string key.
        [key: string]: any;
    };

export interface PromptConfig {
    id: string;
    description?: string;
    messages?: ConversationMessage[];
    promptText?: string;
    points?: PointDefinition[];
    should_not?: PointDefinition[]; // For inverted checks
    idealResponse?: string | null;
    system?: string | null;
    temperature?: number;
}

/**
 * The unified internal representation of a point after normalization.
 * This is what evaluators will work with.
 */
export interface NormalizedPoint {
    id: string; // A unique identifier for the point within the prompt.
    displayText: string; // The text to display in UI tables (e.g., the key point text or function signature).
    multiplier: number; // The weight for scoring, defaults to 1.
    citation?: string;
    isFunction: boolean;
    isInverted?: boolean; // To track if the point came from should_not
    // Fields for LLM-based evaluation
    textToEvaluate?: string;
    // Fields for function-based evaluation
    functionName?: string;
    functionArgs?: any;
}

export interface ComparisonConfig {
    configId?: string; // Now optional
    configTitle?: string; // Now optional
    id?: string; // New, preferred ID field
    title?: string; // New, preferred title field
    description?: string;
    models: string[];
    system?: string | null; // New preferred field
    systemPrompt?: string | null; // Legacy alias for 'system'
    systems?: (string | null)[]; // Optional array of system prompts to run permutations
    concurrency?: number;
    temperature?: number; // Global temperature if 'temperatures' array is not provided
    temperatures?: number[]; // Optional array of temperatures to run for each model/prompt
    prompts: PromptConfig[];
    tags?: string[]; // Added for categorization
    evaluationConfig?: {
        'llm-coverage'?: {
            judgeModels?: string[];
            judgeMode?: 'failover' | 'consensus';
        }
    }
}

export interface ModelResponseDetail {
    finalAssistantResponseText: string;
    fullConversationHistory?: ConversationMessage[];
    hasError: boolean;
    errorMessage?: string;
    systemPromptUsed: string | null;
}

export interface PromptResponseData {
    promptId: string;
    promptText?: string;
    initialMessages?: ConversationMessage[];
    idealResponseText: string | null;
    modelResponses: Map<string, ModelResponseDetail>;
}

export interface EvaluationInput {
    promptData: PromptResponseData;
    config: ComparisonConfig;
    effectiveModelIds: string[];
}

export interface SimilarityScore {
    [modelA: string]: {
        [modelB: string]: number;
    };
}

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
    multiplier: number;
    citation?: string;
    judgeModelId?: string;
    judgeLog?: string[];
    individualJudgements?: IndividualJudgement[];
    isInverted?: boolean;
}

export type CoverageResult = ({
    keyPointsCount: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
} | { error: string }) | null;

export interface LLMCoverageScores {
    [promptId: string]: {
        [modelId: string]: CoverageResult;
    };
}

export interface EmbeddingEvaluationResult {
    similarityMatrix?: SimilarityScore;
    perPromptSimilarities?: Record<string, SimilarityScore>;
}

export interface LLMCoverageEvaluationResult {
    llmCoverageScores?: LLMCoverageScores;
}

export interface FinalComparisonOutputV2 {
    configId: string;
    configTitle: string;
    runLabel: string;
    timestamp: string;
    description?: string;
    sourceCommitSha?: string;
    sourceBlueprintFileName?: string;
    config: ComparisonConfig;
    evalMethodsUsed: EvaluationMethod[];
    effectiveModels: string[];
    modelSystemPrompts?: Record<string, string | null>;
    promptIds: string[];
    promptContexts?: Record<string, string | ConversationMessage[]>;
    extractedKeyPoints?: Record<string, string[]>;
    allFinalAssistantResponses?: Record<string, Record<string, string>>;
    fullConversationHistories?: Record<string, Record<string, ConversationMessage[]>>;
    errors?: Record<string, Record<string, string>>;
    evaluationResults: {
        similarityMatrix?: SimilarityScore;
        perPromptSimilarities?: Record<string, SimilarityScore>;
        llmCoverageScores?: LLMCoverageScores;
    };
}

export interface Evaluator {
    getMethodName(): EvaluationMethod;
    evaluate(inputs: EvaluationInput[]): Promise<Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>>;
}

export { IDEAL_MODEL_ID }; 