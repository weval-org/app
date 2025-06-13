/* eslint-disable @typescript-eslint/no-explicit-any */
import { IDEAL_MODEL_ID } from '../../app/utils/comparisonUtils'; // Corrected path

export type EvaluationMethod = 'embedding' | 'llm-coverage';

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface PromptConfig {
    id: string;
    promptText?: string; // Now optional for backward compatibility
    messages?: ConversationMessage[]; // New field for multi-turn
    idealResponse?: string | null; // This will be the ideal *final* assistant response
    system?: string | null; // Can be handled as the first message in 'messages' or separately
    temperature?: number;
    points?: PointDefinition[]; // These points apply to the *final* assistant response
}

export type PointFunctionArgs = any;
export type PointFunctionDefinition = [string, PointFunctionArgs];

/**
 * The rich object format for defining a point in a blueprint.
 * A point must have *either* 'text' (for LLM-based evaluation)
 * or 'fn' (for programmatic evaluation).
 */
export interface PointObject {
    text?: string;
    fn?: string;
    fnArgs?: PointFunctionArgs;
    multiplier?: number;
    citation?: string;
}

/**
 * Defines a single evaluation criterion (a "point").
 * Can be a simple string (shortcut for { text: "..." }),
 * a tuple for a function (shortcut for { fn: "...", fnArgs: "..." }),
 * or a full PointObject for more control.
 */
export type PointDefinition = string | PointFunctionDefinition | PointObject;

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
    // Fields for LLM-based evaluation
    textToEvaluate?: string;
    // Fields for function-based evaluation
    functionName?: string;
    functionArgs?: PointFunctionArgs;
}

export interface ComparisonConfig {
    configId?: string; // Now optional
    configTitle?: string; // Now optional
    id?: string; // New, preferred ID field
    title?: string; // New, preferred title field
    description?: string;
    models: string[];
    systemPrompt?: string | null;
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
    finalAssistantResponseText: string; // Renamed from responseText for clarity
    fullConversationHistory?: ConversationMessage[]; // To store the whole exchange
    hasError: boolean;
    errorMessage?: string;
    systemPromptUsed: string | null; // System prompt applied to the entire generation if applicable
}

export interface PromptResponseData {
    promptId: string;
    promptText?: string; // For backward compatibility or single-turn context
    initialMessages?: ConversationMessage[]; // The input messages for multi-turn
    idealResponseText: string | null; // Ideal *final* assistant response
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
    judgeModelId?: string; // The model that made the final decision
    judgeLog?: string[]; // A papertrail of evaluation attempts
    individualJudgements?: IndividualJudgement[];
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
    config: ComparisonConfig;
    evalMethodsUsed: EvaluationMethod[];
    effectiveModels: string[];
    modelSystemPrompts?: Record<string, string | null>;
    promptIds: string[];
    promptContexts?: Record<string, string | ConversationMessage[]>; // Replaces promptTexts, stores initial input
    extractedKeyPoints?: Record<string, string[]>;
    allFinalAssistantResponses?: Record<string, Record<string, string>>; // Stores the final model message
    fullConversationHistories?: Record<string, Record<string, ConversationMessage[]>>; // Optional: Stores complete dialogues
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