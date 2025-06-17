// Type definitions (can be shared or imported if defined centrally)
export interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
    multiplier?: number;
    citation?: string;
    individualJudgements?: {
        judgeModelId: string;
        coverageExtent: number;
        reflection: string;
    }[];
}
export type CoverageResult = {
    keyPointsCount: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
} | { error: string } | null;

export type AllCoverageScores = Record<string, Record<string, CoverageResult>>; // promptId -> modelId -> CoverageResult
export type AllFinalAssistantResponses = Record<string, Record<string, string>>; // promptId -> modelId -> response string 