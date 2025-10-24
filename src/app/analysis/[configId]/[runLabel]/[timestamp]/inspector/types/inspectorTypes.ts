import { RenderAsType } from '@/app/components/ResponseRenderer';
import {
  LLMCoverageScores,
  WevalConfig,
  ExecutiveSummary,
  CoverageResult,
  ConversationMessage,
} from '@/types/shared';

// Scenario statistic with calculated average score
export interface ScenarioStat {
  promptId: string;
  promptText: string;
  index: number;
  avgScore: number;
}

export interface ScenariosColumnProps {
  scenarios: ScenarioStat[];
  selectedScenario: string | null;
  selectScenario: (promptId: string) => void;
  executiveSummary: ExecutiveSummary | null | undefined;
  showExecutiveSummary: boolean;
  selectExecutiveSummary: () => void;
  showLeaderboard: boolean;
  selectLeaderboard: () => void;
}

export interface ModelsColumnProps {
  promptId: string;
  models: string[];
  allCoverageScores: LLMCoverageScores | undefined;
  comparisonItems: string[];
  toggleModel: (baseId: string) => void;
  clearAllComparisons: () => void;
  hasMultipleSystemPrompts: boolean;
}

export interface ComparisonViewProps {
  comparisonItems: string[];
  removeFromComparison: (key: string) => void;
  clearAllComparisons: () => void;
  getCachedResponse: (promptId: string, modelId: string) => string | null;
  getCachedEvaluation: (promptId: string, modelId: string) => CoverageResult | null;
  fetchModalResponse: (promptId: string, modelId: string) => Promise<string | null>;
  fetchEvaluationDetails: (promptId: string, modelId: string) => Promise<CoverageResult | null>;
  isLoadingResponse: (promptId: string, modelId: string) => boolean;
  isLoadingEvaluation?: (key: string) => boolean;
  allCoverageScores: LLMCoverageScores | undefined;
  promptTexts: Record<string, string>;
  promptContexts: Record<string, string | ConversationMessage[]>;
  config: WevalConfig;
  hasMultipleSystemPrompts: boolean;
  fetchConversationHistory: (promptId: string, modelId: string) => Promise<ConversationMessage[] | null>;
  getCachedConversationHistory: (promptId: string, modelId: string) => ConversationMessage[] | null;
}

export interface LeaderboardViewProps {
  models: string[];
  allCoverageScores: LLMCoverageScores | undefined;
  promptIds: string[];
  hasMultipleSystemPrompts: boolean;
}

export interface ExecutiveSummaryViewProps {
  executiveSummary: ExecutiveSummary | string | { content: string } | null | undefined;
  config: WevalConfig;
}
