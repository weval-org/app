import { createContext, useContext } from 'react';
import {
    ComparisonDataV2,
} from '@/app/utils/types';
import { ConversationMessage } from '@/types/shared';
import { ActiveHighlight } from '@/app/analysis/components/CoverageTableLegend';
import { AnalysisStats } from '@/app/analysis/hooks/useAnalysisStats';
import { BreadcrumbItem } from '@/app/components/Breadcrumbs';


export interface AnalysisContextType {
    // URL params
    configId: string;
    runLabel: string;
    timestamp: string;

    // Data and state from useComparisonData
    data: ComparisonDataV2 | null;
    loading: boolean;
    error: string | null;
    currentPromptId: string | null;
    promptNotFound: boolean;
    excludedModelsList: string[];
    
    // State from BetaComparisonClientPage
    forceIncludeExcludedModels: boolean;
    setForceIncludeExcludedModels: (value: boolean) => void;
    selectedTemperatures: number[];
    setSelectedTemperatures: React.Dispatch<React.SetStateAction<number[]>>;
    activeSysPromptIndex: number;
    setActiveSysPromptIndex: (value: number) => void;
    activeHighlights: Set<ActiveHighlight>;
    handleActiveHighlightsChange: (newHighlights: Set<ActiveHighlight>) => void;
    
    // Derived state from useModelFiltering
    displayedModels: string[];
    modelsForMacroTable: string[];
    modelsForAggregateView: string[];
    canonicalModels: string[];

    // Derived stats from useAnalysisStats
    analysisStats: AnalysisStats | null;
    
    // Modal state and functions from usePageInteraction
    modelEvaluationModal: {
        isOpen: boolean;
        promptId: string | null;
        modelId: string | null;
    };
    openModelEvaluationDetailModal: (args: { promptId: string; modelId: string; variantScores?: Record<number, number | null>; }) => void;
    closeModelEvaluationDetailModal: () => void;



    // Misc
    resolvedTheme?: string;
    permutationSensitivityMap: Map<string, 'temp' | 'sys' | 'both'>;
    promptTextsForMacroTable: Record<string, string>;

    // New properties for the header
    pageTitle: string;
    breadcrumbItems: BreadcrumbItem[];
    summaryStats: {
        bestPerformingModel: { id: string; score: number } | null;
        worstPerformingModel: { id: string; score: number } | null;
        mostDifferentiatingPrompt: { id: string; score: number; text: string | null } | null;
        mostSimilarPair: { pair: [string, string]; value: number } | null;
    } | null;
    isSandbox: boolean;
    sandboxId?: string;
    normalizedExecutiveSummary: string | null;

    // For ModelPerformanceModal
    modelPerformanceModal: {
        isOpen: boolean;
        modelId: string | null;
    };
    openModelPerformanceModal: (modelId: string) => void;
    closeModelPerformanceModal: () => void;

    // For PromptDetailModal
    promptDetailModal: {
        isOpen: boolean;
        promptId: string | null;
    };
    openPromptDetailModal: (promptId: string) => void;
    closePromptDetailModal: () => void;


}

export const AnalysisContext = createContext<AnalysisContextType | null>(null);

export const useAnalysis = () => {
    const context = useContext(AnalysisContext);
    if (!context) {
        throw new Error('useAnalysis must be used within an AnalysisProvider');
    }
    return context;
}; 