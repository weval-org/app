'use client';

import React from 'react';
import { SharedModelCard, ModelSummary } from './SharedModelCard';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { CoverageResult } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import Icon from '@/components/ui/icon';

interface MobileModelListProps {
    displayedModels: string[];
    promptCoverageScores: Record<string, CoverageResult>;
    promptSimilarities: Record<string, Record<string, number>> | null;
    systemPrompts?: (string | null)[] | null;
    onModelSelect: (modelId: string) => void;
    onClose: () => void;
    selectedModelId: string | null;
}

// Helper function to calculate model performance summary (extracted from KeyPointCoverageTable)
const calculateModelSummary = (coverageResult: CoverageResult | undefined): ModelSummary => {
    if (!coverageResult || 'error' in coverageResult || !coverageResult.pointAssessments) {
        return { total: 0, passed: 0, criticalFailures: 0, majorGaps: 0, avgCoverage: 0 };
    }

    const assessments = coverageResult.pointAssessments;
    const total = assessments.length;
    let passed = 0;
    let criticalFailures = 0;
    let majorGaps = 0;

    assessments.forEach(a => {
        const score = a.coverageExtent;
        if (score === undefined || score === null || isNaN(score)) return;
        
        if (a.isInverted) {
            if (score < 0.7) criticalFailures++;
            else passed++;
        } else {
            if (score < 0.4) majorGaps++;
            else passed++;
        }
    });
    
    const avgCoverage = coverageResult.avgCoverageExtent !== undefined && coverageResult.avgCoverageExtent !== null
        ? Math.round(coverageResult.avgCoverageExtent * 100)
        : 0;

    return { total, passed, criticalFailures, majorGaps, avgCoverage };
};

// Helper function to determine display strategy (extracted from KeyPointCoverageTable)
const getModelDisplayStrategy = (baseIds: string[]) => {
    const prettifiedNames = baseIds.map(baseId => 
        getModelDisplayLabel(baseId, { hideProvider: true, hideModelMaker: true, prettifyModelName: true })
    );
    
    const uniquePrettifiedNames = new Set(prettifiedNames);
    const hasDuplicates = uniquePrettifiedNames.size !== prettifiedNames.length;
    
    if (hasDuplicates) {
        return {
            getDisplayName: (baseId: string) => getModelDisplayLabel(baseId),
            getTooltipName: (baseId: string) => getModelDisplayLabel(baseId)
        };
    } else {
        return {
            getDisplayName: (baseId: string) => getModelDisplayLabel(baseId, { 
                hideProvider: true, 
                hideModelMaker: true, 
                prettifyModelName: true 
            }),
            getTooltipName: (baseId: string) => getModelDisplayLabel(baseId)
        };
    }
};

export const MobileModelList: React.FC<MobileModelListProps> = ({
    displayedModels,
    promptCoverageScores,
    promptSimilarities,
    systemPrompts,
    onModelSelect,
    onClose,
    selectedModelId
}) => {
    // Group models by base ID (same logic as desktop)
    const groupedModels = React.useMemo(() => {
        const groups: Record<string, { modelId: string; systemPromptIndex?: number }[]> = {};

        displayedModels.forEach(modelId => {
            const parsed = parseModelIdForDisplay(modelId);
            if (!groups[parsed.baseId]) {
                groups[parsed.baseId] = [];
            }
            groups[parsed.baseId].push({
                modelId: modelId,
                systemPromptIndex: parsed.systemPromptIndex,
            });
        });
        
        for (const baseId in groups) {
            groups[baseId].sort((a, b) => (a.systemPromptIndex ?? -1) - (b.systemPromptIndex ?? -1));
        }

        return Object.entries(groups).sort(([baseIdA], [baseIdB]) => baseIdA.localeCompare(baseIdB));
    }, [displayedModels]);

    const allBaseIds = groupedModels.map(([baseId]) => baseId);
    const displayStrategy = getModelDisplayStrategy(allBaseIds);

    return (
        <div className="h-full flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
                <button 
                    onClick={onClose}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-h-[44px]"
                    title="Back to prompt view"
                >
                    <Icon name="arrow-left" className="h-5 w-5" />
                    <span className="font-medium">Back to Prompt</span>
                </button>
                <h2 className="font-semibold text-lg flex-1">Select Model</h2>
            </div>

            {/* Model List */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-3">
                {groupedModels.map(([baseId, variants]) => (
                    <div key={baseId}>
                        {variants.length > 1 ? (
                            <Collapsible defaultOpen={true}>
                                <CollapsibleTrigger className='w-full'>
                                    <div className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted font-semibold text-primary text-base border">
                                        <span title={displayStrategy.getTooltipName(baseId)}>
                                            {displayStrategy.getDisplayName(baseId)}
                                        </span>
                                        <Icon name="chevrons-up-down" className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-2 pt-2 pl-3">
                                    {variants.map(({ modelId, systemPromptIndex }) => {
                                        const summary = calculateModelSummary(promptCoverageScores[modelId]);
                                        const systemPrompt = (systemPrompts && systemPromptIndex !== undefined) ? systemPrompts[systemPromptIndex] : undefined;
                                        
                                        let displayText = `Sys. Prompt #${systemPromptIndex}`;
                                        if (systemPrompt) {
                                            displayText = `"${systemPrompt}"`;
                                        } else if (systemPrompt === null) {
                                            displayText = '[No System Prompt]';
                                        }

                                        const similarityScore = promptSimilarities && (promptSimilarities[modelId]?.[IDEAL_MODEL_ID] ?? promptSimilarities[IDEAL_MODEL_ID]?.[modelId] ?? null);

                                        return (
                                            <SharedModelCard
                                                key={modelId}
                                                displayText={displayText}
                                                summary={summary}
                                                similarityScore={similarityScore}
                                                onClick={() => onModelSelect(modelId)}
                                                isSelected={selectedModelId === modelId}
                                                fullModelName={displayStrategy.getTooltipName(baseId)}
                                            />
                                        );
                                    })}
                                </CollapsibleContent>
                            </Collapsible>
                        ) : (
                            variants.map(({ modelId, systemPromptIndex }) => {
                                const summary = calculateModelSummary(promptCoverageScores[modelId]);
                                const systemPrompt = (systemPrompts && systemPromptIndex !== undefined) ? systemPrompts[systemPromptIndex] : undefined;
                                
                                let displayText = displayStrategy.getDisplayName(baseId);
                                if (systemPrompt) {
                                    displayText += ` - "${systemPrompt}"`;
                                } else if (systemPrompt === null) {
                                    displayText += ' - [No System Prompt]';
                                }

                                const similarityScore = promptSimilarities && (promptSimilarities[modelId]?.[IDEAL_MODEL_ID] ?? promptSimilarities[IDEAL_MODEL_ID]?.[modelId] ?? null);

                                return (
                                    <SharedModelCard
                                        key={modelId}
                                        displayText={displayText}
                                        summary={summary}
                                        similarityScore={similarityScore}
                                        onClick={() => onModelSelect(modelId)}
                                        isSelected={selectedModelId === modelId}
                                        fullModelName={displayStrategy.getTooltipName(baseId)}
                                    />
                                );
                            })
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}; 