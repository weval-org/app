'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import TemperatureTabbedEvaluation, { TempVariantBundle } from './TemperatureTabbedEvaluation';

import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { CoverageResult } from '@/app/utils/types';
import PromptInfo from './PromptInfo';
// import { usePreloadIcons } from '@/components/ui/use-preload-icons';

interface ModelEvaluationVariant {
    modelId: string;
    assessments: any[];
    modelResponse: string;
    systemPrompt: string | null;
    temps?: number[];
    perTempMap?: Map<number, ModelEvaluationVariant>; // for aggregate variant only
}

const SpecificEvaluationModal: React.FC = () => {
    const {
        data,
        modelEvaluationModal,
        closeModelEvaluationDetailModal,
        analysisStats,
        fetchModalResponse,
        fetchEvaluationDetails,
        getCachedResponse,
        isLoadingResponse,
    } = useAnalysis();

    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [isMobileView, setIsMobileView] = useState(false);
    const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
    const [loadingResponses, setLoadingResponses] = useState<Set<string>>(new Set());
    const [evaluationDetailsCache, setEvaluationDetailsCache] = useState<Map<string, any>>(new Map());

    // Preload icons used in this modal and child components
    // usePreloadIcons([
    //     'message-square', 'chevron-down', 'quote', 'chevron-up', 
    //     'alert-triangle', 'chevrons-up-down', 'server', 'thumbs-down', 
    //     'check-circle', 'trophy'
    // ]);

    // Extract modal data from context
    const { isOpen, promptId, modelId } = modelEvaluationModal;

    // Mobile detection
    useEffect(() => {
        const checkMobile = () => {
            setIsMobileView(window.innerWidth < 768);
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Fetch response data when modal opens
    useEffect(() => {
        if (!isOpen || !promptId || !modelId || !data) return;

        const { effectiveModels, config } = data;
        const clickedParsed = parseModelIdForDisplay(modelId);
        
        // Determine which model variants we need responses for
        const variantModelIds = (config.systems && config.systems.length > 1)
            ? effectiveModels.filter(m => {
                const p = parseModelIdForDisplay(m);
                return p.baseId === clickedParsed.baseId && p.systemPromptIndex === clickedParsed.systemPromptIndex;
            })
            : effectiveModels.filter(m => {
                const p = parseModelIdForDisplay(m);
                return p.baseId === clickedParsed.baseId;
            });

        // Fetch responses and evaluation details for all variant models AND ideal response
        const allModelIds = [...variantModelIds, IDEAL_MODEL_ID];
        
        allModelIds.forEach(async (modelIdVar) => {
            const cacheKey = `${promptId}:${modelIdVar}`;
            const cachedResponse = getCachedResponse(promptId, modelIdVar);
            const cachedEvaluation = evaluationDetailsCache.get(cacheKey);
            
            // For IDEAL_MODEL_ID, we only need the response, not evaluation details
            const needsEvaluation = modelIdVar !== IDEAL_MODEL_ID;
            
            if ((cachedResponse === null || (needsEvaluation && !cachedEvaluation)) && !isLoadingResponse(promptId, modelIdVar)) {
                setLoadingResponses(prev => new Set([...prev, modelIdVar]));
                try {
                    // Fetch response text for all models, evaluation details only for non-ideal models
                    const fetchPromises = [
                        cachedResponse === null ? fetchModalResponse(promptId, modelIdVar) : Promise.resolve(cachedResponse)
                    ];
                    
                    if (needsEvaluation && !cachedEvaluation) {
                        fetchPromises.push(fetchEvaluationDetails(promptId, modelIdVar));
                    }
                    
                    const results = await Promise.all(fetchPromises);
                    const [responseResult, evaluationResult] = results;
                    
                    // Cache the evaluation details (only for non-ideal models)
                    if (needsEvaluation && evaluationResult && !cachedEvaluation) {
                        setEvaluationDetailsCache(prev => new Map(prev).set(cacheKey, evaluationResult));
                    }
                } finally {
                    setLoadingResponses(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(modelIdVar);
                        return newSet;
                    });
                }
            }
        });
    }, [isOpen, promptId, modelId, data, fetchModalResponse, fetchEvaluationDetails, getCachedResponse, isLoadingResponse]);

    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    // Prepare modal data when modal opens
    const modalData = React.useMemo(() => {        
        if (!isOpen || !promptId || !modelId || !data) return null;
        
        const { evaluationResults, config, allFinalAssistantResponses, promptContexts, effectiveModels } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, CoverageResult>> | undefined;
        
        if (!llmCoverageScores || !allFinalAssistantResponses || !promptContexts) {
            console.error("Cannot open model evaluation modal: core evaluation data is missing.");
            return null;
        }

        const clickedParsed = parseModelIdForDisplay(modelId);
        
        const variantModelIds = (config.systems && config.systems.length > 1)
            ? effectiveModels.filter(m => {
                const p = parseModelIdForDisplay(m);
                return p.baseId === clickedParsed.baseId && p.systemPromptIndex === clickedParsed.systemPromptIndex;
            })
            : effectiveModels.filter(m => {
                const p = parseModelIdForDisplay(m);
                return p.baseId === clickedParsed.baseId;
            });

        const tempBuckets = new Map<number, ModelEvaluationVariant[]>();

        for (const modelIdVar of variantModelIds) {
            const parsed = parseModelIdForDisplay(modelIdVar);
            const sysIndex = parsed.systemPromptIndex ?? 0;

            const modelResult = llmCoverageScores[promptId]?.[modelIdVar];
            // Get response from cache (lazy loaded) instead of data.allFinalAssistantResponses
            const modelResponse = getCachedResponse(promptId, modelIdVar);
            
            // Get detailed evaluation data from cache (includes full keyPointText and reflection)
            const cacheKey = `${promptId}:${modelIdVar}`;
            const detailedEvaluation = evaluationDetailsCache.get(cacheKey);
            
            if (!modelResult || 'error' in modelResult) {
                continue;
            }
            // Skip if response or detailed evaluation not loaded yet - we'll re-render when available
            if (modelResponse === null || !detailedEvaluation || !detailedEvaluation.pointAssessments) {
                continue;
            }

            let effectiveSystemPrompt: string | null = null;
            const promptContext = promptContexts[promptId];
            if (Array.isArray(promptContext) && promptContext.length > 0 && promptContext[0].role === 'system') {
                effectiveSystemPrompt = promptContext[0].content;
            } else {
                const promptConfig = config.prompts.find(p => p.id === promptId);
                effectiveSystemPrompt = promptConfig?.system ?? config.systems?.[sysIndex] ?? config.system ?? null;
            }
            if (!effectiveSystemPrompt) {
                effectiveSystemPrompt = (data as any).modelSystemPrompts?.[modelIdVar] ?? null;
            }

            const entry: ModelEvaluationVariant = {
                modelId: modelIdVar,
                assessments: detailedEvaluation.pointAssessments, // Use detailed data with full keyPointText and reflections
                modelResponse: modelResponse,
                systemPrompt: effectiveSystemPrompt,
            };
            if (!tempBuckets.has(sysIndex)) tempBuckets.set(sysIndex, []);
            tempBuckets.get(sysIndex)!.push(entry);
        }

        const variantEvaluations = new Map<number, ModelEvaluationVariant>();
        tempBuckets.forEach((list, sysIdx) => {
            if (list.length === 0) return;
            if (list.length === 1) {
                variantEvaluations.set(sysIdx, list[0]);
                return;
            }
            // aggregate assessments
            const first = list[0];
            const pointCount = first.assessments.length;
            const aggregatedAssessments = first.assessments.map(a => ({ ...a }));
            for (let i = 0; i < pointCount; i++) {
                const vals: number[] = [];
                list.forEach(v => {
                    const val = v.assessments[i].coverageExtent;
                    if (typeof val === 'number' && !isNaN(val)) vals.push(val);
                });
                if (vals.length) {
                    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                    let sd: number | null = null;
                    if (vals.length >= 2) {
                        const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
                        sd = Math.sqrt(variance);
                    }
                    aggregatedAssessments[i].coverageExtent = mean;
                    (aggregatedAssessments[i] as any).stdev = sd ?? undefined;
                    (aggregatedAssessments[i] as any).sampleCount = vals.length;
                }
            }
            const tempMap = new Map<number, ModelEvaluationVariant>();
            list.forEach(v => {
                const tempVal = parseModelIdForDisplay(v.modelId).temperature ?? (config.temperature ?? 0);
                tempMap.set(tempVal, v);
            });

            variantEvaluations.set(sysIdx, {
                modelId: list.map(v=>v.modelId).join(','),
                assessments: aggregatedAssessments,
                modelResponse: Array.from(tempMap.entries()).sort((a,b)=>a[0]-b[0]).map(([t,v])=>`\n[T ${t}]\n${v.modelResponse}`).join('\n\n'),
                systemPrompt: first.systemPrompt,
                temps: Array.from(tempMap.keys()).sort((a,b)=>a-b),
                perTempMap: tempMap,
            } as any);

        });
        
        // Always return result object so modal can open - even if responses aren't loaded yet
        if (variantEvaluations.size === 0) {
            console.warn(`Could not gather any valid evaluation data for base model ${clickedParsed.baseId} on prompt ${promptId} - may still be loading responses.`);
            // Return minimal data so modal can open and show loading state
        }

        const promptConfig = config.prompts.find(p => p.id === promptId);
        const promptContext = promptContexts[promptId];

        if (!promptContext) {
            console.error(`Could not find prompt context for promptId: ${promptId}. Cannot open modal.`);
            return null;
        }

        const baseModelId = clickedParsed.temperature !== undefined ? `${clickedParsed.baseId}[temp:${clickedParsed.temperature}]` : clickedParsed.baseId;
        // Get ideal response from cache (lazy loaded) instead of stripped data
        const idealResponse = getCachedResponse(promptId, IDEAL_MODEL_ID) || undefined;

        const result = {
            baseModelId: baseModelId,
            promptContext: promptContext,
            promptDescription: promptConfig?.description,
            promptCitation: promptConfig?.citation,
            variantEvaluations: variantEvaluations,
            initialVariantIndex: clickedParsed.systemPromptIndex ?? 0,
            idealResponse: idealResponse,
            variantScores: analysisStats?.perSystemVariantHybridScores,
        };
        
        return result;
    }, [isOpen, promptId, modelId, data, analysisStats, getCachedResponse, evaluationDetailsCache]);

    // Set initial variant index when modal data changes
    useEffect(() => {
        if (modalData) {
            setSelectedVariantIndex(modalData.initialVariantIndex);
        }
    }, [modalData]);

    // Temperature tab state ("agg" or number)
    const [activeTemp, setActiveTemp] = useState<'agg' | number>('agg');

    // Build variant bundle and temperature groupings before any early returns to keep hook order stable
    const variantBundle: ModelEvaluationVariant | null = React.useMemo(() => {
        if (!modalData) return null;
        return modalData.variantEvaluations.get(selectedVariantIndex) || null;
    }, [modalData, selectedVariantIndex]);

    const tempsList = variantBundle?.temps ?? [];

    const tempVariants: TempVariantBundle[] = React.useMemo(() => {
        if (!variantBundle) return [];
        const arr: TempVariantBundle[] = [
            { temperature: null, assessments: variantBundle.assessments, modelResponse: variantBundle.modelResponse }
        ];
        tempsList.forEach((t) => {
            const v = variantBundle.perTempMap?.get(t);
            if (v) arr.push({ temperature: t, assessments: v.assessments, modelResponse: v.modelResponse });
        });
        return arr;
    }, [variantBundle, tempsList]);

    if (!isOpen || !modalData) return null;

    // Show loading state if we have no variant data (still fetching responses)
    const hasVariantData = modalData.variantEvaluations.size > 0;
    const isStillLoading = !hasVariantData && (loadingResponses.size > 0 || modalData.variantEvaluations.size === 0);
    if (isStillLoading) {
        return (
            <Dialog open={isOpen} onOpenChange={closeModelEvaluationDetailModal}>
                <DialogContent className={isMobileView ? "w-[100vw] h-[100vh] max-w-none p-0 m-0 rounded-none border-0 bg-background flex items-center justify-center" : "w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0"}>
                    <DialogHeader>
                        <DialogTitle></DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center justify-center flex-1 py-8">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                            <p className="text-muted-foreground">
                                {loadingResponses.size > 0
                                    ? `Fetching model responses (${loadingResponses.size} remaining)...`
                                    : 'Loading evaluation details...'}
                            </p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const displayModelName = getModelDisplayLabel(modalData.baseModelId);
    const variantKeys = Array.from(modalData.variantEvaluations.keys()).sort((a,b) => a-b);
    const hasMultipleVariants = variantKeys.length > 1;

    const displayedVariant: ModelEvaluationVariant | null = (activeTemp === 'agg' || !variantBundle)
        ? variantBundle
        : variantBundle.perTempMap?.get(activeTemp) || null;

    if (!displayedVariant && !isStillLoading) {
        return (
            <Dialog open={isOpen} onOpenChange={closeModelEvaluationDetailModal}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Error</DialogTitle></DialogHeader>
                    <p>Could not find evaluation data for the selected variant.</p>
                </DialogContent>
            </Dialog>
        );
    }

    // Mobile: Use dedicated full-screen mobile experience
    if (isMobileView) {
        return (
            <Dialog open={isOpen} onOpenChange={closeModelEvaluationDetailModal}>
                <DialogContent className="w-[100vw] h-[100vh] max-w-none p-0 m-0 rounded-none border-0 bg-background flex flex-col overflow-hidden">
                    <DialogTitle className="sr-only">Specific Evaluation Details - Mobile View</DialogTitle>
                    
                    <div className="h-full flex flex-col min-h-0">
                        <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
                            <div className="flex-1 min-w-0">
                                <h2 className="font-semibold text-lg truncate">{displayModelName}</h2>
                                {modalData.promptDescription && (
                                    <p className="text-sm text-muted-foreground truncate">{modalData.promptDescription}</p>
                                )}
                            </div>
                        </div>

                        {/* System Prompt Variant Selection (Mobile) */}
                        {hasMultipleVariants && (
                            <div className="px-4 py-3 border-b bg-muted/30">
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-foreground">System Prompt Variant:</p>
                                    <RadioGroup
                                        value={selectedVariantIndex.toString()}
                                        onValueChange={(value) => setSelectedVariantIndex(parseInt(value, 10))}
                                        className="flex flex-col space-y-1"
                                    >
                                        {variantKeys.map((sysIndex) => {
                                            const score = modalData.variantScores?.[sysIndex];
                                            return (
                                                <div key={sysIndex} className="flex items-center space-x-3">
                                                    <RadioGroupItem value={sysIndex.toString()} id={`mobile-variant-${sysIndex}`} />
                                                    <Label htmlFor={`mobile-variant-${sysIndex}`} className="text-sm cursor-pointer flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span>Variant {sysIndex}</span>
                                                            {score !== null && score !== undefined && (
                                                                <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                                                    {(score * 100).toFixed(0)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                    </Label>
                                                </div>
                                            );
                                        })}
                                    </RadioGroup>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
                            <PromptInfo
                                description={modalData.promptDescription}
                                citation={modalData.promptCitation}
                                promptContext={modalData.promptContext}
                                systemPrompt={displayedVariant!.systemPrompt}
                                variantIndex={selectedVariantIndex}
                            />

                            <TemperatureTabbedEvaluation
                                variants={tempVariants}
                                idealResponse={modalData.idealResponse}
                                expandedLogs={expandedLogs}
                                toggleLogExpansion={toggleLogExpansion}
                                isMobile={isMobileView}
                            />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    // Desktop: Use existing responsive layout
    return (
        <Dialog open={isOpen} onOpenChange={closeModelEvaluationDetailModal}>
            <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-4 md:p-6 pb-3 border-b border-border flex-shrink-0">
                    <DialogTitle className="text-xl font-semibold text-foreground truncate pr-24">
                        <code>{displayModelName}</code> on {modalData.promptDescription ? `"${modalData.promptDescription}"` : `Prompt ${promptId}`}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {/* System Prompt Variant Selection (Desktop) */}
                    {hasMultipleVariants && (
                        <div className="px-4 md:px-6 py-4 border-b bg-muted/30 flex-shrink-0">
                            <div className="space-y-3">
                                <p className="text-sm font-semibold text-foreground">System Prompt Variant:</p>
                                <RadioGroup
                                    value={selectedVariantIndex.toString()}
                                    onValueChange={(value) => setSelectedVariantIndex(parseInt(value, 10))}
                                    className="flex flex-wrap gap-4"
                                >
                                    {variantKeys.map((sysIndex) => {
                                        const score = modalData.variantScores?.[sysIndex];
                                        return (
                                            <div key={sysIndex} className="flex items-center space-x-2">
                                                <RadioGroupItem value={sysIndex.toString()} id={`desktop-variant-${sysIndex}`} />
                                                <Label htmlFor={`desktop-variant-${sysIndex}`} className="text-sm cursor-pointer">
                                                    <div className="flex items-center gap-2">
                                                        <span>Variant {sysIndex}</span>
                                                        {score !== null && score !== undefined && (
                                                            <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                                                {(score * 100).toFixed(0)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </Label>
                                            </div>
                                        );
                                    })}
                                </RadioGroup>
                            </div>
                        </div>
                    )}
                    
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        <div className="p-4 md:p-6 space-y-6">
                            <PromptInfo
                                description={modalData.promptDescription}
                                citation={modalData.promptCitation}
                                promptContext={modalData.promptContext}
                                systemPrompt={displayedVariant!.systemPrompt}
                                variantIndex={selectedVariantIndex}
                            />

                            <TemperatureTabbedEvaluation
                                variants={tempVariants}
                                idealResponse={modalData.idealResponse}
                                expandedLogs={expandedLogs}
                                toggleLogExpansion={toggleLogExpansion}
                                isMobile={false}
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SpecificEvaluationModal; 