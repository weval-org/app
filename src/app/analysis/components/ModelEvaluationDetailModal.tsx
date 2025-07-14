'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import PromptContextDisplay from './PromptContextDisplay';
import { EvaluationView } from './SharedEvaluationComponents';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { CoverageResult } from '@/app/utils/types';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

interface ModelEvaluationVariant {
    modelId: string;
    assessments: any[];
    modelResponse: string;
    systemPrompt: string | null;
}

const ModelEvaluationDetailModal: React.FC = () => {
    const {
        data,
        modelEvaluationModal,
        closeModelEvaluationDetailModal,
        analysisStats,
    } = useAnalysis();

    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [isMobileView, setIsMobileView] = useState(false);
    const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

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

        const clickedParsed = parseEffectiveModelId(modelId);
        
        const variantModelIds = (config.systems && config.systems.length > 1) 
            ? effectiveModels.filter(m => {
                const p = parseEffectiveModelId(m);
                return p.baseId === clickedParsed.baseId && p.temperature === clickedParsed.temperature;
            })
            : [modelId];

        const variantEvaluations = new Map<number, ModelEvaluationVariant>();

        for (const modelIdVar of variantModelIds) {
            const parsed = parseEffectiveModelId(modelIdVar);
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

        return {
            baseModelId: baseModelId,
            promptContext: promptContext,
            promptDescription: promptConfig?.description,
            promptCitation: promptConfig?.citation,
            variantEvaluations: variantEvaluations,
            initialVariantIndex: clickedParsed.systemPromptIndex ?? 0,
            idealResponse: idealResponse,
            variantScores: analysisStats?.perSystemVariantHybridScores,
        };
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
                    <DialogFooter><Button onClick={closeModelEvaluationDetailModal} variant="outline">Close</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Mobile: Use dedicated full-screen mobile experience
    if (isMobileView) {
        return (
            <Dialog open={isOpen} onOpenChange={closeModelEvaluationDetailModal}>
                <DialogContent className="w-[100vw] h-[100vh] max-w-none p-0 m-0 rounded-none border-0 bg-background flex flex-col overflow-hidden">
                    <DialogTitle className="sr-only">Model Evaluation Details - Mobile View</DialogTitle>
                    
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

                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
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
                <DialogHeader className="p-4 md:p-6 pb-3 border-b border-border">
                    <DialogTitle className="text-xl font-semibold text-foreground">
                        Evaluation for: <span className="text-primary">{displayModelName}</span>
                    </DialogTitle>
                    <div className="text-sm text-muted-foreground max-h-32 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                        {modalData.promptDescription && (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1 text-xs">
                                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{modalData.promptDescription}</ReactMarkdown>
                            </div>
                        )}
                        
                        {modalData.promptCitation && (
                            <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2">
                                <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span>Source: {modalData.promptCitation}</span>
                            </div>
                        )}
                        
                        <div>
                            <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Prompt:</p>
                            <PromptContextDisplay promptContext={modalData.promptContext} />
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {/* System Prompt Variant Selection (Desktop) */}
                    {hasMultipleVariants && (
                        <div className="px-4 md:px-6 py-4 border-b bg-muted/30">
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
                    
                    <div className="px-4 md:px-6 pt-4 pb-2 space-y-3">
                        {currentVariant.systemPrompt ? (
                            <div className="p-2 rounded-md bg-sky-100/50 dark:bg-sky-900/30 text-xs text-sky-800 dark:text-sky-200 ring-1 ring-sky-200 dark:ring-sky-800">
                                <p className="font-semibold text-sky-900 dark:text-sky-300">System Prompt (for Variant {selectedVariantIndex}):</p>
                                <p className="whitespace-pre-wrap font-mono">{currentVariant.systemPrompt}</p>
                            </div>
                        ) : (
                            <div className="p-2 rounded-md bg-slate-100/50 dark:bg-slate-900/30 text-xs text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-800">
                                <p className="italic">[No System Prompt was used for this variant]</p>
                            </div>
                        )}
                    </div>

                    <EvaluationView 
                        assessments={currentVariant.assessments}
                        modelResponse={currentVariant.modelResponse}
                        idealResponse={modalData.idealResponse}
                        expandedLogs={expandedLogs}
                        toggleLogExpansion={toggleLogExpansion}
                        isMobile={false}
                    />
                </div>

                <DialogFooter className="p-4 border-t border-border bg-muted/30 dark:bg-slate-900/50">
                    <Button onClick={closeModelEvaluationDetailModal} variant="outline">Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ModelEvaluationDetailModal; 