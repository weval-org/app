'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { RenderAsType } from '@/app/components/ResponseRenderer';

interface ModelEvaluationVariant {
    modelId: string;
    assessments: any[];
    modelResponse: string;
    systemPrompt: string | null;
    temps?: number[];
    perTempMap?: Map<number, ModelEvaluationVariant>; // for aggregate variant only
    renderAs?: RenderAsType;
}

const SpecificEvaluationModal: React.FC = () => {
    const {
        data,
        modelEvaluationModal,
        closeModelEvaluationDetailModal,
        analysisStats,
        fetchPromptResponses,
        fetchModalResponse,
        fetchEvaluationDetails,
        getCachedResponse,
        getCachedEvaluation,
        isLoadingResponse,
    } = useAnalysis();

    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
    const [historiesForPrompt, setHistoriesForPrompt] = useState<Record<string, any>>({});
    // Track whether we've kicked off batch loads for this open cycle (ref to avoid re-render loops)
    const hasRequestedBatchesRef = useRef(false);

    // Preload icons used in this modal and child components
    // usePreloadIcons([
    //     'message-square', 'chevron-down', 'quote', 'chevron-up', 
    //     'alert-triangle', 'chevrons-up-down', 'server', 'thumbs-down', 
    //     'check-circle', 'trophy'
    // ]);

    // Extract modal data from context
    const { isOpen, promptId, modelId } = modelEvaluationModal;

    // No mobile-only rendering; unified layout

    // Kick off scoped loads when modal opens (only needed variants + IDEAL)
    useEffect(() => {
        if (!isOpen || !promptId || !modelId || !data) {
            // Reset when modal closes or identifiers are missing
            hasRequestedBatchesRef.current = false;
            return;
        }
        if (hasRequestedBatchesRef.current) return;
        hasRequestedBatchesRef.current = true;
        try {
            const { effectiveModels, config } = data;
            const clickedParsed = parseModelIdForDisplay(modelId!);
            const variantModelIds = (config.systems && config.systems.length > 1)
                ? effectiveModels.filter(m => {
                    const p = parseModelIdForDisplay(m);
                    return p.baseId === clickedParsed.baseId && p.systemPromptIndex === clickedParsed.systemPromptIndex;
                })
                : effectiveModels.filter(m => parseModelIdForDisplay(m).baseId === clickedParsed.baseId);

            const responsesToFetch = new Set<string>([...variantModelIds, IDEAL_MODEL_ID]);
            const evalsToFetch = new Set<string>(variantModelIds);

            const evalPromises: Array<Promise<any>> = [];

            // Warm the response cache with a single small prompt-level artefact fetch
            // This avoids multiple identical S3 GETs for responses/{promptId}.json
            const warmResponses = fetchPromptResponses(promptId).catch(() => null);
            evalsToFetch.forEach(mId => {
                if (!getCachedEvaluation(promptId, mId)) {
                    evalPromises.push(fetchEvaluationDetails(promptId, mId));
                }
            });

            // Fire in parallel; internal promise-level dedupe prevents duplicates
            Promise.all([warmResponses, ...evalPromises]).catch(() => {});
        } catch {}
    }, [isOpen, promptId, modelId, data, fetchPromptResponses, fetchModalResponse, fetchEvaluationDetails, getCachedResponse, getCachedEvaluation]);

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

        const clickedParsed = parseModelIdForDisplay(modelId!);
        
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
            
            // Get detailed evaluation data from shared cache (includes full keyPointText and reflection)
            const detailedEvaluation = getCachedEvaluation(promptId, modelIdVar);
            
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

            // Attach generated transcript/history if available (keyed by promptId+modelId)
            let generatedTranscript: string | undefined = undefined;
            let generatedHistory: any[] | undefined = undefined;
            try {
                const historyCacheKey = `${promptId}:${modelIdVar}`;
                const hist = historiesForPrompt[historyCacheKey] || (data as any).fullConversationHistories?.[promptId]?.[modelIdVar];
                // Debug: history source
                // eslint-disable-next-line no-console
                console.log('[SpecificEvaluationModal] History lookup', {
                    historyCacheKey,
                    fromInMemory: Array.isArray(historiesForPrompt[historyCacheKey]),
                    fromDataBlob: Array.isArray((data as any).fullConversationHistories?.[promptId]?.[modelIdVar])
                });
                if (Array.isArray(hist) && hist.length > 0) {
                    generatedHistory = hist;
                    const lines: string[] = [];
                    hist.forEach((m: any) => {
                        const role = m.role;
                        const content = m.content === null ? '[assistant: null — to be generated]' : m.content;
                        lines.push(`- ${role}: ${content}`);
                    });
                    generatedTranscript = lines.join('\n');
                }
            } catch {}

            const entry: ModelEvaluationVariant = {
                modelId: modelIdVar,
                assessments: detailedEvaluation.pointAssessments, // Use detailed data with full keyPointText and reflections
                modelResponse: modelResponse,
                systemPrompt: effectiveSystemPrompt,
                // @ts-ignore
                generatedTranscript,
                // @ts-ignore
                generatedHistory,
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
                    (aggregatedAssessments[i] as any).stdDev = sd ?? undefined;
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
                // @ts-ignore - carry over transcript if identical across temps
                ...( (() => {
                    const transcripts = Array.from(tempMap.values()).map(v => (v as any).generatedTranscript).filter(Boolean);
                    const allSame = transcripts.length > 0 && transcripts.every(t => t === transcripts[0]);
                    const histories = Array.from(tempMap.values()).map(v => (v as any).generatedHistory).filter(Boolean) as any[][];
                    const allSameHist = histories.length > 0 && histories.every(h => JSON.stringify(h) === JSON.stringify(histories[0]));
                    const extra: any = {};
                    if (allSame) extra.generatedTranscript = transcripts[0];
                    if (allSameHist) extra.generatedHistory = histories[0];
                    return extra;
                })() )
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
            renderAs: promptConfig?.render_as || 'markdown',
            variantEvaluations: variantEvaluations,
            initialVariantIndex: clickedParsed.systemPromptIndex ?? 0,
            idealResponse: idealResponse,
            variantScores: analysisStats?.perSystemVariantHybridScores,
        };
        
        return result;
    }, [isOpen, promptId, modelId, data, analysisStats, getCachedResponse, getCachedEvaluation, historiesForPrompt]);

    // Set initial variant index when modal data changes
    useEffect(() => {
        if (modalData) {
            setSelectedVariantIndex(modalData.initialVariantIndex);
        }
    }, [modalData]);

    // Temperature selection handled by TemperatureTabbedEvaluation; local state not needed

    // Build variant bundle and temperature groupings before any early returns to keep hook order stable
    const variantBundle: ModelEvaluationVariant | null = React.useMemo(() => {
        if (!modalData) return null;
        return modalData.variantEvaluations.get(selectedVariantIndex) || null;
    }, [modalData, selectedVariantIndex]);

    const tempsList = variantBundle?.temps ?? [];

    const tempVariants: TempVariantBundle[] = React.useMemo(() => {
        if (!variantBundle) return [];
        const arr: TempVariantBundle[] = [];
        tempsList.forEach((t) => {
            const v = variantBundle.perTempMap?.get(t);
            if (v) arr.push({ temperature: t, assessments: v.assessments, modelResponse: v.modelResponse, generatedTranscript: (v as any).generatedTranscript, generatedHistory: (v as any).generatedHistory });
        });
        if (arr.length === 0) {
            // Single variant fallback
            arr.push({ temperature: 0, assessments: variantBundle.assessments, modelResponse: variantBundle.modelResponse, generatedTranscript: (variantBundle as any).generatedTranscript, generatedHistory: (variantBundle as any).generatedHistory });
        }
        return arr;
    }, [variantBundle, tempsList]);

    // Lazy-load histories for relevant model ids when modal opens
    useEffect(() => {
        if (!isOpen || !promptId || !data) return;
        try {
            const { effectiveModels } = data;
            const clickedParsed = parseModelIdForDisplay(modelId!);
            const variantModelIds = (data.config.systems && data.config.systems.length > 1)
                ? effectiveModels.filter(m => {
                    const p = parseModelIdForDisplay(m);
                    return p.baseId === clickedParsed.baseId && p.systemPromptIndex === clickedParsed.systemPromptIndex;
                })
                : effectiveModels.filter(m => parseModelIdForDisplay(m).baseId === clickedParsed.baseId);
            const baseUrl = `/api/comparison/${encodeURIComponent(data.configId)}/${encodeURIComponent(data.runLabel)}/${encodeURIComponent(data.timestamp)}`;
            variantModelIds.forEach(async (mId) => {
                const cacheKey = `${promptId}:${mId}`;
                if (historiesForPrompt[cacheKey]) return;
                try {
                    const url = `${baseUrl}/modal-data/${encodeURIComponent(promptId)}/${encodeURIComponent(mId)}`;
                    // eslint-disable-next-line no-console
                    console.log('[SpecificEvaluationModal] Fetching history', { url, cacheKey });
                    const resp = await fetch(url);
                    if (!resp.ok) return;
                    const json = await resp.json();
                    if (Array.isArray(json.history)) {
                        setHistoriesForPrompt(prev => ({ ...prev, [cacheKey]: json.history }));
                    }
                } catch {}
            });
        } catch {}
    }, [isOpen, promptId, modelId, data, historiesForPrompt]);

    // Reset per-open caches and UI state when modal closes; also when switching prompts
    useEffect(() => {
        if (!isOpen) {
            setHistoriesForPrompt({});
            setExpandedLogs({});
            setSelectedVariantIndex(0);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && promptId) {
            // Drop histories for other prompts to avoid accidental reuse
            setHistoriesForPrompt(prev => {
                const next: Record<string, any> = {};
                Object.keys(prev).forEach(k => { if (k.startsWith(`${promptId}:`)) next[k] = prev[k]; });
                return next;
            });
        }
    }, [isOpen, promptId]);

    if (!isOpen || !modalData) return null;

    // Show loading state if we have no variant data (still fetching responses)
    const hasVariantData = modalData.variantEvaluations.size > 0;
    // Compute a rough remaining count from cache for UX (responses only)
    let remainingCount = 0;
    if (data && promptId && modelId) {
        const clickedParsed = parseModelIdForDisplay(modelId!);
        const { effectiveModels, config } = data;
        const variantModelIds = (config.systems && config.systems.length > 1)
            ? effectiveModels.filter(m => {
                const p = parseModelIdForDisplay(m);
                return p.baseId === clickedParsed.baseId && p.systemPromptIndex === clickedParsed.systemPromptIndex;
            })
            : effectiveModels.filter(m => parseModelIdForDisplay(m).baseId === clickedParsed.baseId);
        const allModelIds = [...variantModelIds, IDEAL_MODEL_ID];
        remainingCount = allModelIds.reduce((acc, mId) => acc + (getCachedResponse(promptId, mId) === null ? 1 : 0), 0);
    }
    const isStillLoading = !hasVariantData && (remainingCount > 0 || modalData.variantEvaluations.size === 0);
    if (isStillLoading) {
        return (
            <Dialog open={isOpen} onOpenChange={closeModelEvaluationDetailModal}>
                <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
                    <DialogHeader>
                        <DialogTitle></DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center justify-center flex-1 py-8">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                            <p className="text-muted-foreground">
                                {remainingCount > 0
                                    ? `Fetching model responses (${remainingCount} remaining)...`
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

    if (!variantBundle && !isStillLoading) {
        return (
            <Dialog open={isOpen} onOpenChange={closeModelEvaluationDetailModal}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Error</DialogTitle></DialogHeader>
                    <p>Could not find evaluation data for the selected variant.</p>
                </DialogContent>
            </Dialog>
        );
    }

    // Unified responsive layout
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
                            {(modalData.promptDescription || modalData.promptCitation) && (
                                <PromptInfo
                                    description={modalData.promptDescription}
                                    citation={modalData.promptCitation}
                                />
                            )}

                            <TemperatureTabbedEvaluation
                                variants={tempVariants}
                                idealResponse={modalData.idealResponse}
                                expandedLogs={expandedLogs}
                                toggleLogExpansion={toggleLogExpansion}
                                isMobile={false}
                                renderAs={modalData.renderAs}
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SpecificEvaluationModal; 