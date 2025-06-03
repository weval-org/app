/* eslint-disable @typescript-eslint/no-explicit-any */
import { IDEAL_MODEL_ID } from '../../app/utils/comparisonUtils'; // Corrected path

export type EvaluationMethod = 'embedding' | 'llm-coverage';

// --- Configuration Types ---

export interface PromptConfig {
    id: string;
    promptText: string;
    idealResponse?: string | null;
    system?: string | null;
    temperature?: number;
    points?: PointDefinition[];
}

export type PointFunctionArgs = any;
export type PointFunctionDefinition = [string, PointFunctionArgs];
export type PointDefinition = string | PointFunctionDefinition;

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
}

// --- Data Handling Types ---

export interface ModelResponseDetail {
    responseText: string;
    hasError: boolean;
    errorMessage?: string;
    systemPromptUsed: string | null;
}

export interface PromptResponseData {
    promptId: string;
    promptText: string;
    idealResponseText: string | null; // Added for clarity
    modelResponses: Map<string, ModelResponseDetail>;
}

export interface EvaluationInput {
    promptData: PromptResponseData;
    config: ComparisonConfig;
    effectiveModelIds: string[];
}

// --- Evaluation Result Types ---

export interface SimilarityScore {
    [modelA: string]: {
        [modelB: string]: number;
    };
}

export interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
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

// --- Final Output Type ---

export interface FinalComparisonOutputV2 {
    configId: string;
    configTitle: string;
    runLabel: string;
    timestamp: string;
    config: ComparisonConfig;
    evalMethodsUsed: EvaluationMethod[];
    effectiveModels: string[];
    modelSystemPrompts?: Record<string, string | null>;
    promptIds: string[];
    promptTexts?: Record<string, string>;
    extractedKeyPoints?: Record<string, string[]>;
    allResponses?: Record<string, Record<string, string>>;
    errors?: Record<string, Record<string, string>>;
    evaluationResults: {
        similarityMatrix?: SimilarityScore;
        perPromptSimilarities?: Record<string, SimilarityScore>;
        llmCoverageScores?: LLMCoverageScores;
    };
}

// --- Evaluator Interface ---

export interface Evaluator {
    getMethodName(): EvaluationMethod;
    evaluate(inputs: EvaluationInput[]): Promise<Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>>;
}

// Re-exporting IDEAL_MODEL_ID for convenience if it's defined elsewhere
// and used by evaluators or pipeline service directly.
// If it's only used internally by comparisonUtils, this isn't strictly necessary here.
export { IDEAL_MODEL_ID }; 