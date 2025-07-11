import { useState, useCallback } from 'react';
import {
    ComparisonDataV2,
    SelectedPairInfo,
    PointAssessment,
    CoverageResult
} from '@/app/utils/types';
import { ConversationMessage } from '@/types/shared';
import { ModelEvaluationDetailModalData } from '@/app/analysis/components/ModelEvaluationDetailModalV2';
import { parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

interface OpenModalOptions {
    promptId: string;
    modelId: string;
    variantScores?: Record<number, number | null>;
}

export function usePageInteraction(data: ComparisonDataV2 | null) {
    const [responseComparisonModal, setResponseComparisonModal] = useState<SelectedPairInfo | null>(null);
    const [modelEvaluationModal, setModelEvaluationModal] = useState<ModelEvaluationDetailModalData | null>(null);

    const prepareResponseComparisonModalData = useCallback((info: Partial<SelectedPairInfo>): SelectedPairInfo | null => {
        if (!data || !info.promptId || !data.promptContexts?.[info.promptId]) return null;

        const fullInfo: SelectedPairInfo = {
            modelA: info.modelA || '',
            modelB: info.modelB || '',
            promptId: info.promptId,
            promptContext: data.promptContexts[info.promptId],
            responseA: data.allFinalAssistantResponses?.[info.promptId]?.[info.modelA || ''] || 'Response not found',
            responseB: data.allFinalAssistantResponses?.[info.promptId]?.[info.modelB || ''] || 'Response not found',
            systemPromptA: data.modelSystemPrompts?.[info.modelA || ''] || null,
            systemPromptB: data.modelSystemPrompts?.[info.modelB || ''] || null,
            semanticSimilarity: info.semanticSimilarity,
            llmCoverageScoreA: info.llmCoverageScoreA,
            llmCoverageScoreB: info.llmCoverageScoreB,
            extractedKeyPoints: data.extractedKeyPoints?.[info.promptId] || null,
            pointAssessmentsA: info.pointAssessmentsA,
            pointAssessmentsB: info.pointAssessmentsB,
        };
        return fullInfo;
    }, [data]);

    const openResponseComparisonModal = useCallback((info: Partial<SelectedPairInfo>) => {
        const modalData = prepareResponseComparisonModalData(info);
        if (modalData) {
            setResponseComparisonModal(modalData);
        }
    }, [prepareResponseComparisonModalData]);

    const closeResponseComparisonModal = () => setResponseComparisonModal(null);

    const prepareModelEvaluationModalData = useCallback(({ promptId, modelId: clickedModelId, variantScores }: OpenModalOptions): ModelEvaluationDetailModalData | null => {
        if (!data || !data.evaluationResults?.llmCoverageScores || !data.config || !data.allFinalAssistantResponses || !data.promptContexts) {
            console.error("Cannot open model evaluation modal: core evaluation data is missing.");
            return null;
        }
        const { effectiveModels, evaluationResults, config, allFinalAssistantResponses, promptContexts, modelSystemPrompts } = data;
        const llmCoverageScoresTyped = evaluationResults.llmCoverageScores as Record<string, Record<string, CoverageResult>>;
        
        const clickedParsed = parseEffectiveModelId(clickedModelId);
        
        const variantModelIds = (config.systems && config.systems.length > 1) 
            ? effectiveModels.filter(m => {
                const p = parseEffectiveModelId(m);
                return p.baseId === clickedParsed.baseId && p.temperature === clickedParsed.temperature;
            })
            : [clickedModelId];

        const variantEvaluations = new Map();

        for (const modelId of variantModelIds) {
            const parsed = parseEffectiveModelId(modelId);
            const sysIndex = parsed.systemPromptIndex ?? 0;

            const modelResult = llmCoverageScoresTyped[promptId]?.[modelId];
            const modelResponse = allFinalAssistantResponses?.[promptId]?.[modelId];
            
            // Determine the effective system prompt using the same logic as other modals
            const promptContext = promptContexts[promptId];
            let effectiveSystemPrompt: string | null = null;
            
            // Highest precedence: a 'system' message in the conversation history
            if (Array.isArray(promptContext) && promptContext.length > 0 && promptContext[0].role === 'system') {
                effectiveSystemPrompt = promptContext[0].content;
            } else {
                // Medium precedence: a 'system' property on the specific prompt
                const promptConfig = config.prompts.find(p => p.id === promptId);
                if (promptConfig?.system) {
                    effectiveSystemPrompt = promptConfig.system;
                } else {
                    // Lowest precedence: a run-level system prompt from a permutation
                    if (config.systems && typeof parsed.systemPromptIndex === 'number' && config.systems[parsed.systemPromptIndex]) {
                        effectiveSystemPrompt = config.systems[parsed.systemPromptIndex];
                    } else if (config.systems && typeof parsed.systemPromptIndex === 'number' && config.systems[parsed.systemPromptIndex] === null) {
                        effectiveSystemPrompt = '[No System Prompt]';
                    } else if (config.system) {
                        // Fallback to global system prompt if no permutation
                        effectiveSystemPrompt = config.system;
                    }
                }
            }

            if (!modelResult || 'error' in modelResult || !modelResult.pointAssessments || modelResponse == null) {
                continue; 
            }

            variantEvaluations.set(sysIndex, {
                modelId: modelId,
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

        const idealResponse = data.allFinalAssistantResponses?.[promptId]?.[IDEAL_MODEL_ID];

        const modalData: ModelEvaluationDetailModalData = {
            baseModelId: baseModelId,
            promptContext: promptContext,
            promptDescription: promptConfig?.description,
            promptCitation: promptConfig?.citation,
            variantEvaluations: variantEvaluations,
            initialVariantIndex: clickedParsed.systemPromptIndex ?? 0,
            idealResponse: idealResponse,
            variantScores: variantScores,
        };

        return modalData;
    }, [data]);

    const openModelEvaluationDetailModal = useCallback(({ promptId, modelId, variantScores }: OpenModalOptions) => {
        const modalData = prepareModelEvaluationModalData({ promptId, modelId, variantScores });
        if (modalData) {
            setModelEvaluationModal(modalData);
        }
    }, [prepareModelEvaluationModalData]);
    
    const closeModelEvaluationDetailModal = () => setModelEvaluationModal(null);

    const handleSimilarityCellClick = useCallback((modelA: string, modelB: string, similarity: number, currentPromptId: string) => {
        if (!data || !currentPromptId || !data.allFinalAssistantResponses || !data.promptContexts) return;

        const coverageScoresForPrompt = data.evaluationResults?.llmCoverageScores?.[currentPromptId] as Record<string, CoverageResult> | undefined;
        
        let coverageA: CoverageResult | null = null;
        let coverageB: CoverageResult | null = null;

        if (coverageScoresForPrompt) {
            coverageA = coverageScoresForPrompt[modelA] ?? null;
            coverageB = coverageScoresForPrompt[modelB] ?? null;
        }
        
        const pointAssessmentsA = (coverageA && !('error' in coverageA)) ? coverageA.pointAssessments : null;
        const pointAssessmentsB = (coverageB && !('error' in coverageB)) ? coverageB.pointAssessments : null;

        openResponseComparisonModal({
            modelA,
            modelB,
            promptId: currentPromptId,
            semanticSimilarity: similarity,
            llmCoverageScoreA: coverageA,
            llmCoverageScoreB: coverageB,
            pointAssessmentsA: pointAssessmentsA || undefined, 
            pointAssessmentsB: pointAssessmentsB || undefined, 
        });
    }, [data, openResponseComparisonModal]);

    const handleCoverageCellClick = useCallback((clickedModelId: string, assessment: PointAssessment | null, currentPromptId: string) => {
        if (!data || !currentPromptId || !assessment) {
            return;
        }
        openModelEvaluationDetailModal({ promptId: currentPromptId, modelId: clickedModelId });
    }, [data, openModelEvaluationDetailModal]);

    const handleSemanticExtremesClick = useCallback((modelId: string) => {
        if (!data || !data.promptIds || data.promptIds.length === 0) return;
        
        const firstPromptId = data.promptIds[0];
        openModelEvaluationDetailModal({ promptId: firstPromptId, modelId: modelId });
    }, [data, openModelEvaluationDetailModal]);

    return {
        responseComparisonModal,
        openResponseComparisonModal,
        closeResponseComparisonModal,
        modelEvaluationModal,
        openModelEvaluationDetailModal,
        closeModelEvaluationDetailModal,
        handleSimilarityCellClick,
        handleCoverageCellClick,
        handleSemanticExtremesClick,
        prepareResponseComparisonModalData,
        prepareModelEvaluationModalData,
    };
} 