import { PointAssessment, CoverageResult, ConversationMessage } from '@/types/shared';

export type AllCoverageScores = Record<string, Record<string, CoverageResult>>; // promptId -> modelId -> CoverageResult
export type AllFinalAssistantResponses = Record<string, Record<string, string>>; // promptId -> modelId -> response string 

export interface AnalysisStats {
    averageSimilarity: {
        value: number;
        stdDev: number;
    },
    consistency: {
        value: number;
        stdDev: number;
    },
    totalRuns: number,
    totalPrompts: number,
    totalModels: number,
    lastRunDate: string,
} 
