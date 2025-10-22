import { getConfig } from '../config';
import { EvaluationInput, FinalComparisonOutputV2, Evaluator, EvaluationMethod, IDEAL_MODEL_ID } from '../types/cli_types';
import { getEmbedding } from '../services/embedding-service'; // Correct path to existing service
import { cosineSimilarity as calculateSimilarity } from '@/lib/math';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { ProgressCallback } from '../services/comparison-pipeline-service.non-stream';
import pLimit from '@/lib/pLimit';
import { AdaptiveRateLimiter } from '@/lib/adaptive-rate-limiter';
import { extractProviderFromModelId, getProviderProfile } from '@/lib/provider-rate-limits';

type Logger = ReturnType<typeof getConfig>['logger'];

export class EmbeddingEvaluator implements Evaluator {
    private logger: Logger;
    private useCache: boolean;

    constructor(logger: Logger, useCache: boolean = false) {
        this.logger = logger;
        this.useCache = useCache;
        this.logger.info(`[EmbeddingEvaluator] Initialized. Caching: ${this.useCache}`);
    }

    getMethodName(): EvaluationMethod { return 'embedding'; }

    async evaluate(
        inputs: EvaluationInput[],
        onProgress?: ProgressCallback,
    ): Promise<Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>> {
        this.logger.info('[EmbeddingEvaluator] Starting evaluation...');

        // --- Adaptive Rate Limiting Setup for Embedding Providers ---
        // Collect all embedding models used across inputs
        const allEmbeddingModels = new Set<string>();
        for (const input of inputs) {
            const embeddingModel = input.embeddingModel || 'openai:text-embedding-3-small';
            allEmbeddingModels.add(embeddingModel);
        }

        // Group embedding models by provider
        const embeddingsByProvider = new Map<string, string[]>();
        for (const embeddingModel of allEmbeddingModels) {
            const provider = extractProviderFromModelId(embeddingModel);
            if (!embeddingsByProvider.has(provider)) {
                embeddingsByProvider.set(provider, []);
            }
            embeddingsByProvider.get(provider)!.push(embeddingModel);
        }

        // Create adaptive limiter for each embedding provider
        const providerLimiters = new Map<string, { adaptive: AdaptiveRateLimiter; limit: ReturnType<typeof pLimit> }>();
        for (const [provider, models] of embeddingsByProvider.entries()) {
            const profile = getProviderProfile(provider);
            // Embeddings are typically faster/cheaper than generation, use same profiles
            const adaptiveLimiter = new AdaptiveRateLimiter(provider, profile, this.logger);

            const initialConcurrency = adaptiveLimiter.getCurrentConcurrency();
            const pLimiter = pLimit(initialConcurrency);

            providerLimiters.set(provider, {
                adaptive: adaptiveLimiter,
                limit: pLimiter,
            });

            this.logger.info(
                `[EmbeddingEvaluator] Configured adaptive rate limiter for '${provider}': ` +
                `${models.length} embedding model(s), initial concurrency=${initialConcurrency}, ` +
                `max=${profile.maxConcurrency}, adaptive=${profile.adaptiveEnabled}`
            );
        }

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
        this.logger.info(`[EmbeddingEvaluator] Preparing to generate ${totalEmbeddings} embeddings.`);
        let embeddedCount = 0;

        textsToEmbed.forEach((text, key) => {
            const promptId = key.split(':')[0];
            const inputForPrompt = inputs.find(i => i.promptData.promptId === promptId);
            const embeddingModel = inputForPrompt?.embeddingModel || 'openai:text-embedding-3-small'; // Fallback for safety

            // Get provider-specific limiter
            const provider = extractProviderFromModelId(embeddingModel);
            const providerLimiterObj = providerLimiters.get(provider);
            const providerLimit = providerLimiterObj?.limit || pLimit(5);
            const adaptiveLimiter = providerLimiterObj?.adaptive;

            this.logger.info(`[EmbeddingEvaluator] Queueing embedding for key: ${key} using model ${embeddingModel}`);
            embeddingTasks.push(providerLimit(async () => {
                try {
                    // Using the imported getEmbedding service function and passing the logger
                    const embedding = await getEmbedding(text, embeddingModel, this.logger, this.useCache);
                    embeddingsMap.set(key, embedding);
                    adaptiveLimiter?.onSuccess();
                } catch (error: any) {
                    this.logger.error(`[EmbeddingEvaluator] Failed to get embedding for key ${key}: ${error.message || String(error)}`);
                    // Check if it's a rate limit error
                    const errorMsg = error.message || String(error);
                    if (errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('Rate limit')) {
                        adaptiveLimiter?.onRateLimit();
                    } else {
                        adaptiveLimiter?.onError();
                    }
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