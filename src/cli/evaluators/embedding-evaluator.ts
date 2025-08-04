import { getConfig } from '../config';
import { EvaluationInput, FinalComparisonOutputV2, Evaluator, EvaluationMethod, IDEAL_MODEL_ID } from '../types/cli_types';
import { getEmbedding } from '../services/embedding-service'; // Correct path to existing service
import { cosineSimilarity as calculateSimilarity } from '@/lib/math';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { ProgressCallback } from '../services/comparison-pipeline-service.non-stream';
import pLimit from '@/lib/pLimit';

type Logger = ReturnType<typeof getConfig>['logger'];

export class EmbeddingEvaluator implements Evaluator {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
        this.logger.info('[EmbeddingEvaluator] Initialized');
    }

    getMethodName(): EvaluationMethod { return 'embedding'; }

    async evaluate(
        inputs: EvaluationInput[],
        onProgress?: ProgressCallback,
    ): Promise<Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>> {
        this.logger.info('[EmbeddingEvaluator] Starting evaluation...');
        const ora = (await import('ora')).default; // Keep ora for potential CLI use if this class were ever used there directly, though pipeline service won't show it.
        const limit = pLimit(20); // Concurrency for embedding calls

        const textsToEmbed = new Map<string, string>();
        const modelIdsInEvaluation = new Set<string>();
        const promptIdsInEvaluation = new Set<string>();

        for (const input of inputs) {
            const { promptData, config } = input; // config is available from input
            promptIdsInEvaluation.add(promptData.promptId);

            // Check from config if idealResponse was intended for this prompt
            const promptConfig = config.prompts.find(p => p.id === promptData.promptId);
            if (promptConfig?.idealResponse && promptData.idealResponseText) {
                const idealKey = `${promptData.promptId}:${IDEAL_MODEL_ID}`;
                textsToEmbed.set(idealKey, promptData.idealResponseText);
                modelIdsInEvaluation.add(IDEAL_MODEL_ID);
            }

            for (const [modelId, responseData] of Object.entries(promptData.modelResponses)) {
                modelIdsInEvaluation.add(modelId);
                if (!responseData.hasError && responseData.finalAssistantResponseText && responseData.finalAssistantResponseText.trim() !== '') {
                    const modelKey = `${promptData.promptId}:${modelId}`;
                    textsToEmbed.set(modelKey, responseData.finalAssistantResponseText);
                } else {
                    this.logger.warn(`[EmbeddingEvaluator] Skipping embedding for ${modelId} on prompt ${promptData.promptId} due to generation error or empty response.`);
                }
            }
        }

        const embeddingsMap = new Map<string, number[]>();
        const embeddingTasks: Promise<void>[] = [];
        const totalEmbeddings = textsToEmbed.size;
        // Spinner logic should be handled by CLI if used directly.
        // The pipeline service logger will just log progress.
        this.logger.info(`[EmbeddingEvaluator] Preparing to generate ${totalEmbeddings} embeddings.`);
        let embeddedCount = 0;

        textsToEmbed.forEach((text, key) => {
            const promptId = key.split(':')[0];
            const inputForPrompt = inputs.find(i => i.promptData.promptId === promptId);
            const embeddingModel = inputForPrompt?.embeddingModel || 'openai:text-embedding-3-small'; // Fallback for safety

            this.logger.info(`[EmbeddingEvaluator] Queueing embedding for key: ${key} using model ${embeddingModel}`);
            embeddingTasks.push(limit(async () => {
                try {
                    // Using the imported getEmbedding service function and passing the logger
                    const embedding = await getEmbedding(text, embeddingModel, this.logger); // Pass this.logger
                    embeddingsMap.set(key, embedding);
                } catch (error: any) {
                    this.logger.error(`[EmbeddingEvaluator] Failed to get embedding for key ${key}: ${error.message || String(error)}`);
                    // EmbeddingsMap will not have this key, similarity calcs will handle it as NaN
                }
                embeddedCount++;
                this.logger.info(`[EmbeddingEvaluator] Generated ${embeddedCount}/${totalEmbeddings} embeddings.`);
                if (onProgress) {
                    await onProgress(embeddedCount, totalEmbeddings);
                }
            }));
        });

        await Promise.all(embeddingTasks);
        this.logger.info(`[EmbeddingEvaluator] Finished generating ${embeddedCount}/${totalEmbeddings} embeddings.`);

        this.logger.info('[EmbeddingEvaluator] Calculating similarities...');
        const allModelIds = Array.from(modelIdsInEvaluation).sort();
        const perPromptSimilarities: Record<string, Record<string, Record<string, number>>> = {};
        const overallSimilaritySums: Record<string, Record<string, number>> = {};
        const overallComparisonCounts: Record<string, Record<string, number>> = {};

        allModelIds.forEach(m1 => {
            overallSimilaritySums[m1] = {};
            overallComparisonCounts[m1] = {};
            allModelIds.forEach(m2 => {
                if (m1 === m2) return;
                overallSimilaritySums[m1][m2] = 0;
                overallComparisonCounts[m1][m2] = 0;
            });
        });

        promptIdsInEvaluation.forEach(promptId => {
            perPromptSimilarities[promptId] = {};
            allModelIds.forEach(m1 => {
                perPromptSimilarities[promptId][m1] = {};
                allModelIds.forEach(m2 => {
                    if (m1 === m2) {
                        perPromptSimilarities[promptId][m1][m2] = 1.0;
                        return;
                    }

                    const keyA = `${promptId}:${m1}`;
                    const keyB = `${promptId}:${m2}`;
                    const embeddingA = embeddingsMap.get(keyA);
                    const embeddingB = embeddingsMap.get(keyB);

                    let similarity = NaN;
                    if (embeddingA && embeddingB) {
                        try {
                            similarity = calculateSimilarity(embeddingA, embeddingB);
                            // Only add to overall sum if similarity is a valid number
                            if (!isNaN(similarity)) {
                                overallSimilaritySums[m1][m2] = (overallSimilaritySums[m1][m2] || 0) + similarity;
                                overallComparisonCounts[m1][m2] = (overallComparisonCounts[m1][m2] || 0) + 1;
                            }
                        } catch (simError: any) {
                            this.logger.warn(`[EmbeddingEvaluator] Error calculating similarity for ${m1} vs ${m2} on prompt ${promptId}: ${simError.message || String(simError)}`);
                        }
                    }
                    perPromptSimilarities[promptId][m1][m2] = similarity;
                });
            });
        });

        const similarityMatrix: Record<string, Record<string, number>> = {};
        allModelIds.forEach(m1 => {
            similarityMatrix[m1] = {};
            allModelIds.forEach(m2 => {
                if (m1 === m2) {
                    similarityMatrix[m1][m2] = 1.0;
                } else {
                    const count = overallComparisonCounts[m1]?.[m2];
                    const sum = overallSimilaritySums[m1]?.[m2];
                    const avg = (count && count > 0 && sum !== undefined && !isNaN(sum)) ? sum / count : NaN;
                    similarityMatrix[m1][m2] = avg;
                    if (!similarityMatrix[m2]) similarityMatrix[m2] = {}; // Ensure symmetry for safety
                    similarityMatrix[m2][m1] = avg; 
                }
            });
        });

        this.logger.info('[EmbeddingEvaluator] Similarity calculations finished.');
        return {
            similarityMatrix,
            perPromptSimilarities
        };
    }
} 