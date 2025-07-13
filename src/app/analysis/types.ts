// Re-export types from other locations for convenience
export type { AllCoverageScores } from '@/app/analysis/components/CoverageHeatmapCanvas';

// Define AllFinalAssistantResponses type
export type AllFinalAssistantResponses = Record<string, Record<string, string>>; // promptId -> modelId -> response text 