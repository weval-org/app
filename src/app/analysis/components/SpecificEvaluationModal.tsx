'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { EvaluationView } from './SharedEvaluationComponents';
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
}

const SpecificEvaluationModal: React.FC = () => {
    const {
        data,
        modelEvaluationModal,
        closeModelEvaluationDetailModal,
        analysisStats,
    } = useAnalysis();

    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [isMobileView, setIsMobileView] = useState(false);
    const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

    // Preload icons used in this modal and child components
    // usePreloadIcons([
    //     'message-square', 'chevron-down', 'quote', 'chevron-up', 
    //     'alert-triangle', 'chevrons-up-down', 'server', 'thumbs-down', 
    //     'check-circle', 'trophy'
    // ]);

    // Extract modal data from context
    const { isOpen, promptId, modelId } = modelEvaluationModal;

    console.log('[DEBUG] SpecificEvaluationModal render:', { isOpen, promptId, modelId });

    // Mobile detection
    useEffect(() => {
        const checkMobile = () => {
            setIsMobileView(window.innerWidth < 768);
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    // Prepare modal data when modal opens
    const modalData = React.useMemo(() => {
        console.log('[DEBUG] modalData useMemo running:', { isOpen, promptId, modelId, hasData: !!data });
        
        if (!isOpen || !promptId || !modelId || !data) return null;

        console.log('[DEBUG] Starting modalData computation...');
        
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
                return p.baseId === clickedParsed.baseId && p.temperature === clickedParsed.temperature;
            })
            : [modelId];

        const variantEvaluations = new Map<number, ModelEvaluationVariant>();

        for (const modelIdVar of variantModelIds) {
            const parsed = parseModelIdForDisplay(modelIdVar);
            const sysIndex = parsed.systemPromptIndex ?? 0;

            const modelResult = llmCoverageScores[promptId]?.[modelIdVar];
            const modelResponse = allFinalAssistantResponses?.[promptId]?.[modelIdVar];
            
            let effectiveSystemPrompt: string | null = null;
            const promptContext = promptContexts[promptId];

            if (Array.isArray(promptContext) && promptContext.length > 0 && promptContext[0].role === 'system') {
                effectiveSystemPrompt = promptContext[0].content;
            } else {
                const promptConfig = config.prompts.find(p => p.id === promptId);
                if (promptConfig?.system) {
                    effectiveSystemPrompt = promptConfig.system;
                } else {
                    if (config.systems && typeof parsed.systemPromptIndex === 'number' && config.systems[parsed.systemPromptIndex]) {
                        effectiveSystemPrompt = config.systems[parsed.systemPromptIndex];
                    } else if (config.systems && typeof parsed.systemPromptIndex === 'number' && config.systems[parsed.systemPromptIndex] === null) {
                        effectiveSystemPrompt = '[No System Prompt]';
                    } else if (config.system) {
                        effectiveSystemPrompt = config.system;
                    }
                }
            }

            if (!modelResult || 'error' in modelResult || !modelResult.pointAssessments || modelResponse == null) {
                continue; 
            }

            variantEvaluations.set(sysIndex, {
                modelId: modelIdVar,
                assessments: modelResult.pointAssessments,
                modelResponse: modelResponse,
                systemPrompt: effectiveSystemPrompt
            });
        }
        
        if (variantEvaluations.size === 0) {
            console.warn(`Could not gather any valid evaluation data for base model ${clickedParsed.baseId} on prompt ${promptId}.`);
            return null;
        }

        const promptConfig = config.prompts.find(p => p.id === promptId);
        const promptContext = promptContexts[promptId];

        if (!promptContext) {
            console.error(`Could not find prompt context for promptId: ${promptId}. Cannot open modal.`);
            return null;
        }

        const baseModelId = clickedParsed.temperature !== undefined ? `${clickedParsed.baseId}[temp:${clickedParsed.temperature}]` : clickedParsed.baseId;
        const idealResponse = allFinalAssistantResponses?.[promptId]?.[IDEAL_MODEL_ID];

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
        
        console.log('[DEBUG] modalData computation completed successfully:', result);
        return result;
    }, [isOpen, promptId, modelId, data, analysisStats]);

    // Set initial variant index when modal data changes
    useEffect(() => {
        if (modalData) {
            setSelectedVariantIndex(modalData.initialVariantIndex);
        }
    }, [modalData]);

    if (!isOpen || !modalData) return null;

    const displayModelName = getModelDisplayLabel(modalData.baseModelId);
    const variantKeys = Array.from(modalData.variantEvaluations.keys()).sort((a,b) => a-b);
    const hasMultipleVariants = variantKeys.length > 1;
    const currentVariant = modalData.variantEvaluations.get(selectedVariantIndex);

    if (!currentVariant) {
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
                                systemPrompt={currentVariant.systemPrompt}
                                variantIndex={selectedVariantIndex}
                            />
                            
                            <EvaluationView 
                                assessments={currentVariant.assessments}
                                modelResponse={currentVariant.modelResponse}
                                idealResponse={modalData.idealResponse}
                                expandedLogs={expandedLogs}
                                toggleLogExpansion={toggleLogExpansion}
                                isMobile={true}
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
                                systemPrompt={currentVariant.systemPrompt}
                                variantIndex={selectedVariantIndex}
                            />
                            
                            <EvaluationView 
                                assessments={currentVariant.assessments}
                                modelResponse={currentVariant.modelResponse}
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