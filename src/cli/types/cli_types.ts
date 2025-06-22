/* eslint-disable @typescript-eslint/no-explicit-any */
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import {
    ConversationMessage,
    CoverageResult,
    PointAssessment,
    IndividualJudgement,
    EvaluationMethod,
    PointDefinition,
    WevalPromptConfig as PromptConfig,
    WevalConfig as ComparisonConfig,
    WevalResult as FinalComparisonOutputV2,
    SimilarityScore,
    LLMCoverageScores,
    WevalEvaluationResults,
} from '@/types/shared';

// Re-exporting aliases for local consistency throughout the CLI
export type {
    EvaluationMethod,
    PointDefinition,
    PromptConfig,
    ComparisonConfig,
    FinalComparisonOutputV2,
    SimilarityScore,
    LLMCoverageScores
};

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

export interface EmbeddingEvaluationResult {
    similarityMatrix?: SimilarityScore;
    perPromptSimilarities?: Record<string, SimilarityScore>;
}

export interface LLMCoverageEvaluationResult {
    llmCoverageScores?: LLMCoverageScores;
}

export interface Evaluator {
    getMethodName(): EvaluationMethod;
    evaluate(inputs: EvaluationInput[]): Promise<Partial<WevalEvaluationResults & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>>;
}

export { IDEAL_MODEL_ID }; 