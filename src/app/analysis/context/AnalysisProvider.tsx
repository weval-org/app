'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { AnalysisContext, AnalysisContextType } from './AnalysisContext';
import { useComparisonData, useComparisonDataV2 } from '@/app/analysis/hooks/useComparisonData';
import { useAnalysisStats } from '@/app/analysis/hooks/useAnalysisStats';
import { useModelFiltering } from '@/app/analysis/hooks/useModelFiltering';

import { ActiveHighlight } from '@/app/analysis/components/CoverageTableLegend';
import { ComparisonDataV2, CoverageResult } from '@/app/utils/types';
import { calculateStandardDeviation, findSimilarityExtremes } from '@/app/utils/calculationUtils';
import { parseEffectiveModelId, getCanonicalModels } from '@/app/utils/modelIdUtils';
import {  useRouter, useSearchParams } from 'next/navigation';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';

import { useToast } from '@/components/ui/use-toast';

import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import type { BreadcrumbItem } from '@/app/components/Breadcrumbs';

interface AnalysisProviderProps {
    // For full analysis mode
    initialData?: ComparisonDataV2;
    
    // For minimal/listing mode
    pageTitle?: string;
    breadcrumbItems?: BreadcrumbItem[];
    configTitle?: string;
    description?: string;
    tags?: string[];
    
    // Common props
    configId: string;
    runLabel?: string;
    timestamp?: string;
    isSandbox?: boolean;
    sandboxId?: string;
    children: React.ReactNode;
}

const EMPTY_BREADCRUMBS: BreadcrumbItem[] = [];
const EMPTY_SENSITIVITY_MAP = new Map<string, 'temp' | 'sys' | 'both'>();
const EMPTY_PROMPT_TEXTS = {};

export const AnalysisProvider: React.FC<AnalysisProviderProps> = ({ 
    initialData, 
    pageTitle: propPageTitle,
    breadcrumbItems: propBreadcrumbItems,
    configTitle: propConfigTitle,
    description: propDescription,
    tags: propTags,
    configId: configIdFromProps,
    runLabel: runLabelFromProps,
    timestamp: timestampFromProps,
    isSandbox: isSandboxFromProps,
    sandboxId: sandboxIdFromProps,
    children 
}) => {
    const [latchedInitialData] = useState(initialData);
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentPromptId = searchParams.get('prompt');

    // Determine mode based on whether we have initial data
    const isFullMode = !!latchedInitialData;
    
    const configId = configIdFromProps || latchedInitialData?.configId || '';
    const runLabel = runLabelFromProps || latchedInitialData?.runLabel || '';
    const timestamp = timestampFromProps || latchedInitialData?.timestamp || '';
    const isSandbox = isSandboxFromProps || false;

    // Only load data if we have initial data
    // const { data, loading, error, promptNotFound, excludedModelsList } = useComparisonData({
    //     initialData: initialData || null,
    //     currentPromptId: isFullMode ? currentPromptId : null,
    //     disabled: !isFullMode,
    // });
    const { data, loading, error, promptNotFound, excludedModelsList } = useComparisonDataV2({
        initialData: latchedInitialData || null,
        currentPromptId: isFullMode ? currentPromptId : null,
        disabled: !isFullMode,
    });

    const [forceIncludeExcludedModels, setForceIncludeExcludedModels] = useState<boolean>(false);
    const [selectedTemperatures, setSelectedTemperatures] = useState<number[]>(() => {
        if (isFullMode && latchedInitialData?.config?.temperatures) {
            return latchedInitialData.config.temperatures;
        }
        return [];
    });
    const [activeSysPromptIndex, setActiveSysPromptIndex] = useState(0);
    const [activeHighlights, setActiveHighlights] = useState<Set<ActiveHighlight>>(new Set());
    const { resolvedTheme } = useTheme();

    // State for ModelPerformanceModal
    const [modelPerformanceModal, setModelPerformanceModal] = useState({ isOpen: false, modelId: null as string | null });
    const openModelPerformanceModal = useCallback((modelId: string) => {
        if (!isFullMode) {
            console.log('Opening model performance modal for:', modelId, '(listing mode - could fetch data on-demand)');
        }
        setModelPerformanceModal({ isOpen: true, modelId });
    }, [isFullMode]);
    const closeModelPerformanceModal = useCallback(() => setModelPerformanceModal({ isOpen: false, modelId: null }), []);

    // State for PromptDetailModal  
    const [promptDetailModal, setPromptDetailModal] = useState({ isOpen: false, promptId: null as string | null });
    const openPromptDetailModal = useCallback((promptId: string) => {
        if (!isFullMode) {
            console.log('Opening prompt detail modal for:', promptId, '(listing mode - could fetch data on-demand)');
        }
        setPromptDetailModal({ isOpen: true, promptId });
    }, [isFullMode]);
    const closePromptDetailModal = useCallback(() => setPromptDetailModal({ isOpen: false, promptId: null }), []);

    const handleActiveHighlightsChange = useCallback((newHighlights: Set<ActiveHighlight>) => {
        setActiveHighlights(prevHighlights => {
            if (prevHighlights.size === newHighlights.size && [...prevHighlights].every(h => newHighlights.has(h))) {
                return prevHighlights;
            }
            return newHighlights;
        });
    }, []);

    // Only compute analysis stats for full mode
    const analysisStats = useAnalysisStats(isFullMode ? data : null);

    const { displayedModels, modelsForMacroTable, modelsForAggregateView } = useModelFiltering({
        data: isFullMode ? data : null,
        currentPromptId: isFullMode ? currentPromptId : null,
        forceIncludeExcludedModels,
        excludedModelsList,
        activeSysPromptIndex,
        selectedTemperatures,
    });
    
    const canonicalModels = useMemo(() => {
        if (!data) return displayedModels;
        return getCanonicalModels(displayedModels, data.config);
    }, [data, displayedModels]);

    const permutationSensitivityMap = useMemo(() => {
        if (!isFullMode || !data || !data.effectiveModels || !data.evaluationResults?.llmCoverageScores) return EMPTY_SENSITIVITY_MAP;

        const sensitivityMap = new Map<string, 'temp' | 'sys' | 'both'>();
        const { effectiveModels, promptIds, evaluationResults, config } = data;
        const llmCoverageScores = evaluationResults.llmCoverageScores as Record<string, Record<string, CoverageResult>>;

        const baseModelGroups = new Map<string, string[]>();
        effectiveModels.forEach(modelId => {
            const parsed = parseEffectiveModelId(modelId);
            if (!baseModelGroups.has(parsed.baseId)) {
                baseModelGroups.set(parsed.baseId, []);
            }
            baseModelGroups.get(parsed.baseId)!.push(modelId);
        });

        const PERM_SENSITIVITY_THRESHOLD = 0.2;

        for (const [baseId, modelIdsInGroup] of baseModelGroups.entries()) {
            if (modelIdsInGroup.length < 2) continue;

            const parsedModels = modelIdsInGroup.map(id => parseEffectiveModelId(id));
            const hasTempVariants = new Set(parsedModels.map(p => p.temperature)).size > 1;
            const hasSysVariants = new Set(parsedModels.map(p => p.systemPromptIndex)).size > 1;

            if (!hasTempVariants && !hasSysVariants) continue;

            promptIds.forEach(promptId => {
                let sensitiveToTemp = false;
                let sensitiveToSys = false;

                if (hasTempVariants) {
                    const scoresBySysPrompt = new Map<number, number[]>();
                    modelIdsInGroup.forEach(modelId => {
                        const parsed = parseEffectiveModelId(modelId);
                        const result = llmCoverageScores[promptId]?.[modelId];
                        if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                            if (parsed.systemPromptIndex !== undefined) {
                                if (!scoresBySysPrompt.has(parsed.systemPromptIndex)) {
                                    scoresBySysPrompt.set(parsed.systemPromptIndex, []);
                                }
                                scoresBySysPrompt.get(parsed.systemPromptIndex)!.push(result.avgCoverageExtent);
                            }
                        }
                    });

                    for (const scores of scoresBySysPrompt.values()) {
                        if (scores.length > 1) {
                            const stdDev = calculateStandardDeviation(scores);
                            if (stdDev !== null && stdDev > PERM_SENSITIVITY_THRESHOLD) {
                                sensitiveToTemp = true;
                                break;
                            }
                        }
                    }
                }

                if (hasSysVariants) {
                    const scoresByTemp = new Map<number, number[]>();
                    modelIdsInGroup.forEach(modelId => {
                        const parsed = parseEffectiveModelId(modelId);
                        const result = llmCoverageScores[promptId]?.[modelId];
                        if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                            const temp = parsed.temperature ?? config.temperature ?? 0.0;
                            if (!scoresByTemp.has(temp)) {
                                scoresByTemp.set(temp, []);
                            }
                            scoresByTemp.get(temp)!.push(result.avgCoverageExtent);
                        }
                    });

                    for (const scores of scoresByTemp.values()) {
                        if (scores.length > 1) {
                            const stdDev = calculateStandardDeviation(scores);
                            if (stdDev !== null && stdDev > PERM_SENSITIVITY_THRESHOLD) {
                                sensitiveToSys = true;
                                break;
                            }
                        }
                    }
                }

                const key = `${promptId}:${baseId}`;
                if (sensitiveToTemp && sensitiveToSys) {
                    sensitivityMap.set(key, 'both');
                } else if (sensitiveToTemp) {
                    sensitivityMap.set(key, 'temp');
                } else if (sensitiveToSys) {
                    sensitivityMap.set(key, 'sys');
                }
            });
        }
        return sensitivityMap;
    }, [data, isFullMode]);

    const getPromptContextDisplayString = useMemo(() => {
        if (!isFullMode || !data) return (promptId: string) => promptId;
        
        return (promptId: string): string => {
            const context = data.promptContexts?.[promptId];
            if (typeof context === 'string') {
              return context;
            }
            if (Array.isArray(context) && context.length > 0) {
              const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
              if (lastUserMessage) {
                return `User: ${lastUserMessage.content.substring(0, 300)}${lastUserMessage.content.length > 300 ? '...' : ''}`;
              }
              return `Multi-turn context (${context.length} messages)`;
            }
            return promptId;
        }
    }, [data, isFullMode]);

    const promptTextsForMacroTable = useMemo(() => {
        if (!isFullMode || !data?.promptContexts) return EMPTY_PROMPT_TEXTS;
        return Object.fromEntries(
          Object.entries(data.promptContexts).map(([promptId, context]) => [
            promptId,
            typeof context === 'string' ? context : getPromptContextDisplayString(promptId)
          ])
        );
    }, [data?.promptContexts, getPromptContextDisplayString, isFullMode]);

    // Page title and breadcrumbs
    const currentPromptDisplayText = useMemo(() => {
        if (!isFullMode) return 'All Prompts';
        return currentPromptId ? getPromptContextDisplayString(currentPromptId) : 'All Prompts';
    }, [currentPromptId, getPromptContextDisplayString, isFullMode]);
  
    const pageTitle = useMemo(() => {
        if (!isFullMode && propPageTitle) {
            return propPageTitle;
        }
        
        let title = "Analysis";
        if (data) {
            title = `${data.configTitle || configId}`;
        } else if (configId && runLabel && timestamp) {
            title = `${configId} - ${runLabel}`;
            title += ` (${formatTimestampForDisplay(fromSafeTimestamp(timestamp))})`;
        }
        if (currentPromptId) {
            title += ` - Prompt: ${currentPromptDisplayText}`;
        }
        return title;
    }, [data, configId, runLabel, timestamp, currentPromptId, currentPromptDisplayText, isFullMode, propPageTitle]);

    const breadcrumbItems = useMemo(() => {
        if (!isFullMode && propBreadcrumbItems) {
            return propBreadcrumbItems;
        }
        if (!data) return EMPTY_BREADCRUMBS;
        
        const items = [
            { label: 'Home', href: '/' },
            {
                label: data.configTitle || configId,
                href: `/analysis/${configId}`,
            },
            {
                label: `Version ${runLabel.substring(0, 4)}`,
                href: `/analysis/${configId}/${runLabel}`,
            },
            {
                label: formatTimestampForDisplay(fromSafeTimestamp(timestamp)),
                href: `/analysis/${configId}/${runLabel}/${timestamp}`
            }
        ];

        if (currentPromptId) {
            items.push({
                label: `Prompt: ${currentPromptId.substring(0, 10)}...`,
                href: `/analysis/${configId}/${runLabel}/${timestamp}?prompt=${currentPromptId}`
            });
        }
        return items;
    }, [data, configId, runLabel, timestamp, currentPromptId, isFullMode, propBreadcrumbItems]);

    const normalizedExecutiveSummary = useMemo(() => {
        if (!isFullMode || !data?.executiveSummary) return null;
        const content = typeof data.executiveSummary === 'string' ? data.executiveSummary : data.executiveSummary.content;
        return content.replace(/^#+\s/gm, '## ');
    }, [data?.executiveSummary, isFullMode]);

    const summaryStats = useMemo(() => {
        if (!isFullMode || !data || !analysisStats) return null;

        const mdpFromStats = analysisStats.mostDifferentiatingPrompt;

        const mostDifferentiatingPrompt = mdpFromStats
            ? {
                id: mdpFromStats.id,
                score: mdpFromStats.score,
                text: getPromptContextDisplayString(mdpFromStats.id),
            }
            : null;
            
        let bestPerformer = null;
        let worstPerformer = null;

        if (isSandbox) {
            if (analysisStats.overallCoverageExtremes?.bestCoverage) {
                bestPerformer = {
                    id: analysisStats.overallCoverageExtremes.bestCoverage.modelId,
                    score: analysisStats.overallCoverageExtremes.bestCoverage.avgScore,
                };
            }
            if (analysisStats.overallCoverageExtremes?.worstCoverage) {
                worstPerformer = {
                    id: analysisStats.overallCoverageExtremes.worstCoverage.modelId,
                    score: analysisStats.overallCoverageExtremes.worstCoverage.avgScore,
                };
            }
        } else if (analysisStats.overallHybridExtremes) {
            if (analysisStats.overallHybridExtremes.bestHybrid) {
                bestPerformer = {
                    id: analysisStats.overallHybridExtremes.bestHybrid.modelId,
                    score: analysisStats.overallHybridExtremes.bestHybrid.avgScore,
                };
            }
            if (analysisStats.overallHybridExtremes.worstHybrid) {
                worstPerformer = {
                    id: analysisStats.overallHybridExtremes.worstHybrid.modelId,
                    score: analysisStats.overallHybridExtremes.worstHybrid.avgScore,
                };
            }
        }

        const overallPairExtremes = findSimilarityExtremes(data.evaluationResults?.similarityMatrix);

        // Get model leaderboard (top 5) - always based on coverage scores
        let modelLeaderboard = null;
        if (analysisStats.allModelCoverageRankings?.rankedModels) {
            modelLeaderboard = analysisStats.allModelCoverageRankings.rankedModels
                .slice(0, 5)
                .map(model => ({
                    id: model.modelId,
                    score: model.avgScore,
                    count: model.count
                }));
        }

        return {
            bestPerformingModel: bestPerformer,
            worstPerformingModel: worstPerformer,
            mostDifferentiatingPrompt,
            mostSimilarPair: overallPairExtremes.mostSimilar,
            modelLeaderboard,
        };
    }, [isSandbox, data, analysisStats, getPromptContextDisplayString, isFullMode]);

    // Create minimal data for non-full mode
    const contextData = useMemo(() => {
        if (isFullMode) {
            return data;
        }
        
        // Create minimal data structure for listing mode
        return {
            configId,
            configTitle: propConfigTitle || configId,
            runLabel,
            timestamp,
            config: {
                id: configId,
                title: propConfigTitle || configId,
                description: propDescription,
                tags: propTags,
                models: [],
                prompts: [],
            },
            promptIds: [],
            effectiveModels: [],
            evaluationResults: {
                llmCoverageScores: {},
                similarityMatrix: {},
                perPromptSimilarities: {},
                perModelHybridScores: {},
                perModelSemanticScores: {},
                promptStatistics: {},
            },
            allFinalAssistantResponses: {},
            promptContexts: {},
            excludedModels: [],
            evalMethodsUsed: [],
        } as ComparisonDataV2;
    }, [isFullMode, data, configId, propConfigTitle, runLabel, timestamp, propDescription, propTags]);

    const { toast } = useToast();

    // Model Evaluation Modal Logic
    const [modelEvaluationModal, setModelEvaluationModal] = useState<{
        isOpen: boolean;
        promptId: string | null;
        modelId: string | null;
    }>({ isOpen: false, promptId: null, modelId: null });
    
    const openModelEvaluationDetailModal = useCallback((args: { promptId: string; modelId: string; variantScores?: Record<number, number | null>; }) => {
        setModelEvaluationModal({ isOpen: true, promptId: args.promptId, modelId: args.modelId });
    }, []);
    
    const closeModelEvaluationDetailModal = useCallback(() => {
        setModelEvaluationModal({ isOpen: false, promptId: null, modelId: null });
    }, []);

    const contextValue: AnalysisContextType = useMemo(() => ({
        configId,
        runLabel,
        timestamp,
        data: contextData,
        loading: isFullMode ? loading : false,
        error: isFullMode ? error : null,
        promptNotFound: isFullMode ? promptNotFound : false,
        excludedModelsList: isFullMode ? excludedModelsList : [],
        forceIncludeExcludedModels,
        setForceIncludeExcludedModels,
        selectedTemperatures,
        setSelectedTemperatures,
        activeSysPromptIndex,
        setActiveSysPromptIndex,
        activeHighlights,
        handleActiveHighlightsChange,
        displayedModels,
        modelsForMacroTable,
        modelsForAggregateView,
        canonicalModels,
        analysisStats,
        modelEvaluationModal,
        openModelEvaluationDetailModal,
        closeModelEvaluationDetailModal,
        resolvedTheme,
        permutationSensitivityMap,
        promptTextsForMacroTable,
        currentPromptId: isFullMode ? currentPromptId : null,
        pageTitle,
        breadcrumbItems,
        summaryStats,
        isSandbox,
        sandboxId: sandboxIdFromProps,
        normalizedExecutiveSummary,
        modelPerformanceModal,
        openModelPerformanceModal,
        closeModelPerformanceModal,
        promptDetailModal,
        openPromptDetailModal,
        closePromptDetailModal
    }), [
        configId, runLabel, timestamp, contextData, isFullMode, loading, error, promptNotFound, excludedModelsList,
        forceIncludeExcludedModels, setForceIncludeExcludedModels, 
        selectedTemperatures, setSelectedTemperatures, 
        activeSysPromptIndex, setActiveSysPromptIndex, 
        activeHighlights, handleActiveHighlightsChange, 
        displayedModels, modelsForMacroTable, modelsForAggregateView,
        canonicalModels, analysisStats, modelEvaluationModal, openModelEvaluationDetailModal,
        closeModelEvaluationDetailModal, resolvedTheme, permutationSensitivityMap,
        promptTextsForMacroTable, currentPromptId, pageTitle, breadcrumbItems, summaryStats,
        isSandbox, sandboxIdFromProps, normalizedExecutiveSummary, modelPerformanceModal,
        openModelPerformanceModal, closeModelPerformanceModal, promptDetailModal,
        openPromptDetailModal, closePromptDetailModal
    ]);

    return (
        <AnalysisContext.Provider value={contextValue}>
            {children}
        </AnalysisContext.Provider>
    );
}; 