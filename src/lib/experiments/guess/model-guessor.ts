/**
 * Model Guessor - Universal Implementation
 *
 * Analyzes text(s) to determine which LLM model likely wrote them.
 * Works with both single texts and multiple texts (paragraphs).
 *
 * For EACH text:
 * 1. Extracts a prompt from that specific text
 * 2. Generates model responses using that prompt (5 variations per model)
 * 3. Embeds the text and all model responses
 * 4. Calculates cosine distances between text and model responses
 *
 * Then averages distances per model across all texts for final ranking.
 * Lower distance = more similar = more likely that model wrote the text.
 */

import { getConfig } from '@/cli/config';
import { getModelResponse } from '@/cli/services/llm-service';
import { getEmbedding } from '@/cli/services/embedding-service';
import pLimit from '@/lib/pLimit';
import { AdaptiveRateLimiter } from '@/lib/adaptive-rate-limiter';
import { extractProviderFromModelId, getProviderProfile } from '@/lib/provider-rate-limits';
import { getRepresentativeSample } from '@/lib/experiments/guess/paragraph-splitter';

// Reuse extractor prompt from single-text guessor
const EXTRACTOR_SYSTEM_PROMPT = `Given a passage you will output a 'prompt' that you might imagine was used to trigger the writing of the passage. For example, given:

<passage>The Lieutenant-Governor came slowly toward her, and, placing his hands upon her shoulders, looked her in the eyes.</passage>

Output:

<prompt>Begin with one character placing their hands on another's shoulders and meeting their eyes. Let that touch reveal everything unsaid—power, love, regret, or control—without a single word spoken.</prompt>`;

const TEMPERATURES = [0.5];

interface ModelResponse {
    modelId: string;
    temperature: number | null;
    seed: number | null;
    response: string;
}

export interface GuessResult {
    modelId: string;
    avgDistance: number;
    minDistance: number;
    maxDistance: number;
    samples: number;
    textsAnalyzed: number; // NEW: how many input texts were analyzed
}

export interface ProgressEvent {
    type: 'start' | 'extracting' | 'generating' | 'embedding' | 'calculating' | 'complete' | 'error';
    message: string;
    progress?: number;
    detail?: string;
}

function cosineDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 2;
    }

    const cosineSimilarity = dotProduct / (normA * normB);
    return 1 - cosineSimilarity;
}

async function extractPromptFromText(
    text: string,
    extractorModelId: string,
    logger: any,
): Promise<string> {
    logger.info(`[Model Guessor] Extracting prompt using ${extractorModelId}...`);

    const userPrompt = `<passage>${text}</passage>

Output the prompt that could have been used to generate this passage. Only output the prompt itself, wrapped in <prompt></prompt> tags.`;

    const response = await getModelResponse({
        modelId: extractorModelId,
        systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.3,
        useCache: true,
    });

    const match = response.match(/<prompt>(.*?)<\/prompt>/s);
    const extractedPrompt = match ? match[1].trim() : response.trim();

    logger.info(`[Model Guessor]   ✓ Extracted prompt: "${extractedPrompt.substring(0, 100)}..."`);

    return extractedPrompt;
}

/**
 * Guess which model wrote the given text(s)
 *
 * Can handle both single texts and multiple texts:
 * - Single text: Pass Set with 1 element, e.g., new Set([text])
 * - Multiple texts: Pass Set with N elements, e.g., new Set([para1, para2, para3])
 *
 * For EACH text in the set:
 * 1. Extract prompt from that specific text
 * 2. Generate model responses using that prompt
 * 3. Embed the text and model responses
 * 4. Calculate distances
 *
 * Then average distances per model across all texts
 */
export async function guessModel(
    textSet: Set<string>,
    candidateModels: string[],
    onProgress: (event: ProgressEvent) => void,
    options: {
        embeddingModel?: string;
        extractorModel?: string;
        abortSignal?: AbortSignal;
    } = {},
): Promise<GuessResult[]> {
    const { logger } = getConfig();

    const embeddingModel = options.embeddingModel || 'openai:text-embedding-3-small';
    const extractorModel = options.extractorModel || 'openai:gpt-4o-mini';
    const abortSignal = options.abortSignal;

    // Helper to check if aborted
    const checkAborted = () => {
        if (abortSignal?.aborted) {
            logger.info('[Model Guessor] ⚠️ Analysis aborted by client');
            throw new Error('Analysis cancelled by user');
        }
    };

    const textsArray = Array.from(textSet);
    const numTexts = textsArray.length;

    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`MODEL GUESSOR`);
    logger.info(`${'='.repeat(80)}`);
    logger.info(`Input texts: ${numTexts}`);
    logger.info(`Candidate models: ${candidateModels.length}`);
    logger.info(`Total responses to generate: ${numTexts} texts × ${candidateModels.length} models = ${numTexts * candidateModels.length}`);

    onProgress({
        type: 'start',
        message: 'Starting multi-text analysis...',
        progress: 0,
    });

    // Accumulate distances per model across all texts
    const allDistancesByModel = new Map<string, number[]>();
    const totalOperations = numTexts * candidateModels.length;
    let completedOperations = 0;

    // Group models by provider for adaptive rate limiting (setup once for all texts)
    const modelsByProvider = new Map<string, string[]>();
    for (const modelId of candidateModels) {
        const provider = extractProviderFromModelId(modelId);
        if (!modelsByProvider.has(provider)) {
            modelsByProvider.set(provider, []);
        }
        modelsByProvider.get(provider)!.push(modelId);
    }

    const providerLimiters = new Map<string, { adaptive: AdaptiveRateLimiter; limit: ReturnType<typeof pLimit> }>();

    for (const [provider, models] of modelsByProvider.entries()) {
        const profile = getProviderProfile(provider);
        const adaptiveLimiter = new AdaptiveRateLimiter(provider, profile, logger);
        const initialConcurrency = adaptiveLimiter.getCurrentConcurrency();
        const pLimiter = pLimit(initialConcurrency);

        providerLimiters.set(provider, {
            adaptive: adaptiveLimiter,
            limit: pLimiter,
        });

        logger.info(
            `[Model Guessor] Configured rate limiter for '${provider}': ` +
            `${models.length} models, concurrency=${initialConcurrency}`
        );
    }

    const globalLimit = pLimit(30);
    const embeddingLimiter = pLimit(20);
    const textProcessingLimit = pLimit(5); // Process up to 5 texts in parallel

    let textsCompleted = 0;

    // Process all texts in parallel (up to 5 at a time)
    await Promise.all(
        textsArray.map((currentText, textIdx) =>
            textProcessingLimit(async () => {
                // Check if cancelled before starting this text
                checkAborted();

                const textNum = textIdx + 1;

                logger.info(`\n[Model Guessor] ========== Processing text ${textNum}/${numTexts} (${currentText.length} chars) ==========`);

                onProgress({
                    type: 'extracting',
                    message: `Analyzing writing samples...`,
                    progress: Math.floor((textsCompleted / numTexts) * 10),
                    detail: `${textsCompleted}/${numTexts} samples processed`,
                });

                // Step 1: Extract prompt from THIS specific text
                const extractedPrompt = await extractPromptFromText(currentText, extractorModel, logger);

                // Calculate length constraints for THIS text
                const maxTokens = Math.ceil(currentText.length * 5);
                const targetWords = Math.round(currentText.length / 5);
                const promptWithLengthHint = `${extractedPrompt}\n\n(Please generate approximately ${targetWords} words)`;

                logger.info(`[Model Guessor] Text ${textNum} constraints: maxTokens=${maxTokens}, targetWords=${targetWords}`);

                // Check if cancelled before expensive model generation
                checkAborted();

                // Step 2: Generate model responses for THIS text's prompt
                const allResponsePromises: Promise<ModelResponse>[] = [];

                for (const modelId of candidateModels) {
                    const isReasoningModel = modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4-');
                    const supportsTemperature = !isReasoningModel;

                    const provider = extractProviderFromModelId(modelId);
                    const providerLimiter = providerLimiters.get(provider);
                    const providerLimit = providerLimiter?.limit || globalLimit;
                    const adaptiveLimiter = providerLimiter?.adaptive;

                    if (supportsTemperature) {
                        for (const temperature of TEMPERATURES) {
                            allResponsePromises.push(
                                providerLimit(async () => {
                                    try {
                                const response = await getModelResponse({
                                    modelId,
                                    prompt: promptWithLengthHint,
                                    temperature,
                                    maxTokens,
                                    timeout: 30000,
                                    useCache: true,
                                });

                                adaptiveLimiter?.onSuccess();

                                completedOperations++;
                                const progress = 10 + Math.floor((completedOperations / totalOperations) * 70);
                                onProgress({
                                    type: 'generating',
                                    message: `Generating comparisons...`,
                                    progress,
                                    detail: `${completedOperations}/${totalOperations} model responses generated`,
                                });

                                return {
                                    modelId,
                                    temperature,
                                    seed: null,
                                    response,
                                };
                            } catch (error: any) {
                                if (error.isRateLimitError) {
                                    adaptiveLimiter?.onRateLimit(error.retryAfter);
                                } else {
                                    adaptiveLimiter?.onError();
                                }
                                throw error;
                            }
                        }),
                    );
                }
            } else {
                // For reasoning models (no temperature support), generate single response
                allResponsePromises.push(
                    providerLimit(async () => {
                        try {
                            const response = await getModelResponse({
                                modelId,
                                prompt: promptWithLengthHint,
                                maxTokens,
                                timeout: 30000,
                                useCache: true,
                            });

                            adaptiveLimiter?.onSuccess();

                            completedOperations++;
                            const progress = 10 + Math.floor((completedOperations / totalOperations) * 70);
                            onProgress({
                                type: 'generating',
                                message: `Generating comparisons...`,
                                progress,
                                detail: `${completedOperations}/${totalOperations} model responses generated`,
                            });

                            return {
                                modelId,
                                temperature: null,
                                seed: 1,
                                response,
                            };
                        } catch (error: any) {
                            if (error.isRateLimitError) {
                                adaptiveLimiter?.onRateLimit(error.retryAfter);
                            } else {
                                adaptiveLimiter?.onError();
                            }
                            throw error;
                        }
                    }),
                );
            }
        }

        const modelResponses = await Promise.all(allResponsePromises);

        logger.info(`[Model Guessor] Text ${textNum}: Generated ${modelResponses.length} model responses`);

        // Check if cancelled before expensive embedding operations
        checkAborted();

        // Step 3: Embed THIS text AND its model responses (ALL IN PARALLEL)
        onProgress({
            type: 'embedding',
            message: `Analyzing patterns...`,
            progress: 80,
        });

        // Embed text and all responses in parallel
        const [textEmbedding, ...responseEmbeddings] = await Promise.all([
            // Text embedding (first element)
            embeddingLimiter(async () =>
                getEmbedding(currentText, embeddingModel, logger, true)
            ),
            // All response embeddings (spread into remaining elements)
            ...modelResponses.map((resp) =>
                embeddingLimiter(async () => {
                    const emb = await getEmbedding(resp.response, embeddingModel, logger, true);
                    return { ...resp, embedding: emb };
                })
            ),
        ]);

        logger.info(`[Model Guessor] Text ${textNum}: Created ${responseEmbeddings.length + 1} embeddings`);

        // Step 4: Calculate distances for THIS text
        for (const respEmb of responseEmbeddings) {
            const distance = cosineDistance(textEmbedding, respEmb.embedding);

            if (!allDistancesByModel.has(respEmb.modelId)) {
                allDistancesByModel.set(respEmb.modelId, []);
            }
            allDistancesByModel.get(respEmb.modelId)!.push(distance);
        }

        logger.info(`[Model Guessor] Text ${textNum}: Calculated ${responseEmbeddings.length} distances`);

        textsCompleted++;
            })
        )
    );

    // Step 5: Compute average distance for each model across all texts
    onProgress({
        type: 'calculating',
        message: 'Finalizing results...',
        progress: 95,
    });

    const results: GuessResult[] = [];
    for (const [modelId, distances] of allDistancesByModel.entries()) {
        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        const minDistance = Math.min(...distances);
        const maxDistance = Math.max(...distances);

        results.push({
            modelId,
            avgDistance,
            minDistance,
            maxDistance,
            samples: distances.length,
            textsAnalyzed: numTexts,
        });
    }

    // Sort by average distance (lower = more similar)
    results.sort((a, b) => a.avgDistance - b.avgDistance);

    logger.info(`\n[Model Guessor] ========== RESULTS SUMMARY ==========`);
    logger.info(`[Model Guessor] Analyzed ${numTexts} text sample(s)`);
    logger.info(`[Model Guessor] Top 3 guesses:`);
    for (let i = 0; i < Math.min(3, results.length); i++) {
        const r = results[i];
        const similarity = (1 - (r.avgDistance / 2)) * 100;
        logger.info(
            `[Model Guessor]   ${i + 1}. ${r.modelId}: ${similarity.toFixed(1)}% ` +
            `(avg_dist: ${r.avgDistance.toFixed(4)})`
        );
    }
    logger.info(`[Model Guessor] ========================================`);

    // Don't send 'complete' here - the stream route will send it with results
    onProgress({
        type: 'calculating',
        message: 'Analysis complete',
        progress: 100,
    });

    return results;
}
