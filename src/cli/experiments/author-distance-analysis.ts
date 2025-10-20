/**
 * Author Distance Analysis
 *
 * Compares the embedding distance between LLM models to the distance between
 * literary authors, to quantify and contextualize model personality shifts.
 */

import { getConfig } from '../config';
import { getModelResponse } from '../services/llm-service';
import { getEmbedding } from '../services/embedding-service';
import pLimit from '@/lib/pLimit';
import {
  AuthorPassage,
  ExtractedPrompt,
  ModelResponse,
  EmbeddingData,
  DistanceResult,
  AuthorDistanceAnalysisResult,
} from './author-distance-types';

const EXTRACTOR_SYSTEM_PROMPT = `Given a passage you will output a 'prompt' that you might imagine was used to trigger the writing of the passage. For example, given:

<passage>The Lieutenant-Governor came slowly toward her, and, placing his hands upon her shoulders, looked her in the eyes.</passage>

Output:

<prompt>Begin with one character placing their hands on another's shoulders and meeting their eyes. Let that touch reveal everything unsaid—power, love, regret, or control—without a single word spoken.</prompt>`;

/**
 * Calculate cosine distance between two vectors
 * Returns distance in range [0, 2] where 0 = identical, 2 = opposite
 */
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
    return 2; // Maximum distance for zero vectors
  }

  const cosineSimilarity = dotProduct / (normA * normB);
  // Convert similarity [-1, 1] to distance [0, 2]
  return 1 - cosineSimilarity;
}

/**
 * Extract prompts from author passages using an LLM
 */
export async function extractPromptsFromPassages(
  passages: AuthorPassage[],
  extractorModelId: string = 'openai:gpt-4o-mini',
): Promise<ExtractedPrompt[]> {
  const { logger } = getConfig();
  const limiter = pLimit(5); // Process 5 at a time

  logger.info(`\n[Author Distance] Extracting prompts from ${passages.length} passages using ${extractorModelId}...`);

  const extractedPrompts = await Promise.all(
    passages.map((passage, idx) =>
      limiter(async () => {
        logger.info(`  [${idx + 1}/${passages.length}] Extracting prompt for ${passage.author}...`);

        const userPrompt = `<passage>${passage.passage}</passage>

Output the prompt that could have been used to generate this passage. Only output the prompt itself, wrapped in <prompt></prompt> tags.`;

        try {
          const response = await getModelResponse({
            modelId: extractorModelId,
            systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
            prompt: userPrompt,
            temperature: 0.3,
            useCache: true,
          });

          // Extract prompt from response
          const match = response.match(/<prompt>(.*?)<\/prompt>/s);
          const extractedPrompt = match ? match[1].trim() : response.trim();

          logger.info(`    ✓ Extracted: "${extractedPrompt.substring(0, 80)}..."`);

          return {
            authorPassage: passage,
            extractedPrompt,
            extractorModelId,
          };
        } catch (error) {
          logger.error(`    ✗ Failed to extract prompt: ${error}`);
          throw error;
        }
      }),
    ),
  );

  return extractedPrompts;
}

/**
 * Generate model responses for each extracted prompt
 */
export async function generateModelResponses(
  extractedPrompts: ExtractedPrompt[],
  candidateModels: string[],
  samplesPerPrompt: number = 3,
  temperature: number = 0.7,
): Promise<ModelResponse[]> {
  const { logger } = getConfig();
  const limiter = pLimit(10); // Process 10 at a time

  const totalTasks = extractedPrompts.length * candidateModels.length * samplesPerPrompt;
  logger.info(
    `\n[Author Distance] Generating ${totalTasks} responses (${extractedPrompts.length} prompts × ${candidateModels.length} models × ${samplesPerPrompt} samples)...`,
  );

  const allResponsePromises: Promise<ModelResponse>[] = [];
  let completed = 0;

  for (const [passageIdx, extracted] of extractedPrompts.entries()) {
    for (const modelId of candidateModels) {
      for (let sampleIdx = 0; sampleIdx < samplesPerPrompt; sampleIdx++) {
        allResponsePromises.push(
          limiter(async () => {
            // Reasoning models (like GPT-5, o1, o3, o4) need special handling:
            // 1. They don't support temperature parameter
            // 2. They use tokens for internal reasoning, so need much higher maxTokens
            //    Note: reasoning models can use 4000+ tokens just for reasoning, then need more for actual output
            // 3. They take longer to respond due to reasoning, so need longer timeout
            // 4. They support reasoning_effort parameter to control how much reasoning they do
            const isReasoningModel = modelId.includes('gpt-5') || modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4-');
            const effectiveMaxTokens = isReasoningModel ? 10000 : 4000; // Reasoning models need room for reasoning + output
            const effectiveTimeout = isReasoningModel ? 120000 : 30000; // 2 minutes for reasoning models, 30s for others

            let response: string;
            try {
              response = await getModelResponse({
                modelId,
                prompt: extracted.extractedPrompt,
                ...(isReasoningModel ? {} : { temperature }),
                ...(isReasoningModel ? { reasoningEffort: 'low' } : {}), // Use minimal reasoning for creative writing
                maxTokens: effectiveMaxTokens,
                timeout: effectiveTimeout,
                useCache: true,
              });
            } catch (error: any) {
              // Log detailed error information
              logger.error(`    ✗ Error for ${modelId}:`);
              logger.error(`       Type: ${error?.constructor?.name || 'Unknown'}`);
              logger.error(`       Message: ${error?.message || 'No message'}`);
              logger.error(`       Stack: ${error?.stack?.split('\n')[0] || 'No stack'}`);

              // If it still fails and mentions temperature/parameters, retry without temperature
              if (!isReasoningModel && (error?.message?.includes('temperature') || error?.message?.includes('parameter') || error?.message?.includes('not supported'))) {
                logger.warn(`    ⚠ ${modelId} doesn't support temperature, retrying without it...`);
                response = await getModelResponse({
                  modelId,
                  prompt: extracted.extractedPrompt,
                  // No temperature parameter
                  maxTokens: effectiveMaxTokens,
                  timeout: effectiveTimeout,
                  useCache: true,
                });
              } else {
                logger.error(`    ✗ Failed for ${modelId}: ${error?.message || error}`);
                throw error;
              }
            }

            completed++;
            logger.info(`  [${completed}/${totalTasks}] ${modelId} → ${extracted.authorPassage.author} (sample ${sampleIdx + 1})`);

            return {
              modelId,
              authorName: extracted.authorPassage.author,
              passageIndex: passageIdx,
              prompt: extracted.extractedPrompt,
              response,
              sampleIndex: sampleIdx,
            };
          }),
        );
      }
    }
  }

  return Promise.all(allResponsePromises);
}

/**
 * Embed all texts (author passages + model responses)
 */
export async function embedAllTexts(
  passages: AuthorPassage[],
  modelResponses: ModelResponse[],
  embeddingModel: string = 'openai:text-embedding-3-small',
): Promise<EmbeddingData[]> {
  const { logger } = getConfig();
  const limiter = pLimit(20); // Process 20 at a time

  const totalTexts = passages.length + modelResponses.length;
  logger.info(`\n[Author Distance] Embedding ${totalTexts} texts using ${embeddingModel}...`);

  const embeddingPromises: Promise<EmbeddingData>[] = [];
  let completed = 0;

  // Embed author passages
  for (const [idx, passage] of passages.entries()) {
    embeddingPromises.push(
      limiter(async () => {
        const embedding = await getEmbedding(passage.passage, embeddingModel, logger, true);
        completed++;
        logger.info(`  [${completed}/${totalTexts}] Embedded author passage: ${passage.author}`);

        return {
          type: 'author_passage' as const,
          author: passage.author,
          passageIndex: idx,
          embedding,
          text: passage.passage,
        };
      }),
    );
  }

  // Embed model responses
  for (const response of modelResponses) {
    embeddingPromises.push(
      limiter(async () => {
        const embedding = await getEmbedding(response.response, embeddingModel, logger, true);
        completed++;
        logger.info(
          `  [${completed}/${totalTexts}] Embedded model response: ${response.modelId} → ${response.authorName}`,
        );

        return {
          type: 'model_response' as const,
          author: response.authorName,
          passageIndex: response.passageIndex,
          modelId: response.modelId,
          sampleIndex: response.sampleIndex,
          embedding,
          text: response.response,
        };
      }),
    );
  }

  return Promise.all(embeddingPromises);
}

/**
 * Calculate all distances between entities
 */
export function calculateDistances(
  embeddings: EmbeddingData[],
  authors: string[],
  models: string[],
): {
  authorToAuthor: DistanceResult[];
  modelToAuthor: DistanceResult[];
  modelToModel: DistanceResult[];
} {
  const { logger } = getConfig();
  logger.info(`\n[Author Distance] Calculating distances...`);

  // Group embeddings by type
  const authorEmbeddings = embeddings.filter(e => e.type === 'author_passage');
  const modelEmbeddings = embeddings.filter(e => e.type === 'model_response');

  // Calculate author-to-author distances
  const authorToAuthor: DistanceResult[] = [];
  for (let i = 0; i < authors.length; i++) {
    for (let j = i + 1; j < authors.length; j++) {
      const authorA = authors[i];
      const authorB = authors[j];

      const embeddingsA = authorEmbeddings.filter(e => e.author === authorA);
      const embeddingsB = authorEmbeddings.filter(e => e.author === authorB);

      let totalDistance = 0;
      let count = 0;

      for (const embA of embeddingsA) {
        for (const embB of embeddingsB) {
          totalDistance += cosineDistance(embA.embedding, embB.embedding);
          count++;
        }
      }

      if (count > 0) {
        authorToAuthor.push({
          type: 'author_to_author',
          entityA: authorA,
          entityB: authorB,
          distance: totalDistance / count,
          samples: count,
        });
      }
    }
  }

  logger.info(`  ✓ Calculated ${authorToAuthor.length} author-to-author distances`);

  // Calculate model-to-author distances
  const modelToAuthor: DistanceResult[] = [];
  for (const model of models) {
    for (const author of authors) {
      const modelEmbs = modelEmbeddings.filter(e => e.modelId === model && e.author === author);
      const authorEmbs = authorEmbeddings.filter(e => e.author === author);

      let totalDistance = 0;
      let count = 0;

      for (const modelEmb of modelEmbs) {
        for (const authorEmb of authorEmbs) {
          totalDistance += cosineDistance(modelEmb.embedding, authorEmb.embedding);
          count++;
        }
      }

      if (count > 0) {
        modelToAuthor.push({
          type: 'model_to_author',
          entityA: model,
          entityB: author,
          distance: totalDistance / count,
          samples: count,
        });
      }
    }
  }

  logger.info(`  ✓ Calculated ${modelToAuthor.length} model-to-author distances`);

  // Calculate model-to-model distances
  const modelToModel: DistanceResult[] = [];
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const modelA = models[i];
      const modelB = models[j];

      const embsA = modelEmbeddings.filter(e => e.modelId === modelA);
      const embsB = modelEmbeddings.filter(e => e.modelId === modelB);

      let totalDistance = 0;
      let count = 0;

      for (const embA of embsA) {
        for (const embB of embsB) {
          // Only compare responses to the same author's prompts
          if (embA.author === embB.author && embA.passageIndex === embB.passageIndex) {
            totalDistance += cosineDistance(embA.embedding, embB.embedding);
            count++;
          }
        }
      }

      if (count > 0) {
        modelToModel.push({
          type: 'model_to_model',
          entityA: modelA,
          entityB: modelB,
          distance: totalDistance / count,
          samples: count,
        });
      }
    }
  }

  logger.info(`  ✓ Calculated ${modelToModel.length} model-to-model distances`);

  return {
    authorToAuthor,
    modelToAuthor,
    modelToModel,
  };
}

/**
 * Normalize distances to 0-1 scale within their category
 */
function normalizeDistances(distances: number[]): Map<number, number> {
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  const range = max - min;

  const normalized = new Map<number, number>();

  // Handle edge case where all distances are the same
  if (range === 0) {
    distances.forEach(d => normalized.set(d, 0.5));
    return normalized;
  }

  distances.forEach(d => {
    normalized.set(d, (d - min) / range);
  });

  return normalized;
}

/**
 * Interpret results by finding closest author pairs to model pairs
 * Uses both raw distances and normalized distances (min-max scaled to 0-1)
 */
export function interpretResults(
  distances: {
    authorToAuthor: DistanceResult[];
    modelToAuthor: DistanceResult[];
    modelToModel: DistanceResult[];
  },
): AuthorDistanceAnalysisResult['interpretation'] {
  const { logger } = getConfig();
  logger.info(`\n[Author Distance] Interpreting results...`);

  // Calculate min-max normalized distances
  const authorDistValues = distances.authorToAuthor.map(d => d.distance);
  const modelDistValues = distances.modelToModel.map(d => d.distance);

  const authorNormalized = normalizeDistances(authorDistValues);
  const modelNormalized = normalizeDistances(modelDistValues);

  logger.info(`\n  📊 Distance ranges:`);
  logger.info(`     Authors: ${Math.min(...authorDistValues).toFixed(3)} - ${Math.max(...authorDistValues).toFixed(3)}`);
  logger.info(`     Models:  ${Math.min(...modelDistValues).toFixed(3)} - ${Math.max(...modelDistValues).toFixed(3)}`);
  logger.info(`\n  🔄 Using normalized distances (0-1 scale) for comparison\n`);

  const closestAuthorPairs: AuthorDistanceAnalysisResult['interpretation']['closestAuthorPairs'] = [];

  for (const modelDist of distances.modelToModel) {
    const modelNorm = modelNormalized.get(modelDist.distance) || 0;

    // Find the author pair with the closest NORMALIZED distance
    let closestAuthorPair: [string, string] | null = null;
    let closestDistance = Infinity;
    let closestNormalizedDistance = Infinity;
    let smallestNormalizedDifference = Infinity;

    for (const authorDist of distances.authorToAuthor) {
      const authorNorm = authorNormalized.get(authorDist.distance) || 0;
      const normalizedDifference = Math.abs(modelNorm - authorNorm);

      if (normalizedDifference < smallestNormalizedDifference) {
        smallestNormalizedDifference = normalizedDifference;
        closestAuthorPair = [authorDist.entityA, authorDist.entityB];
        closestDistance = authorDist.distance;
        closestNormalizedDistance = authorNorm;
      }
    }

    if (closestAuthorPair) {
      const percentageDifference = (smallestNormalizedDifference / Math.max(modelNorm, 0.01)) * 100;

      closestAuthorPairs.push({
        modelPair: [modelDist.entityA, modelDist.entityB],
        distance: modelDist.distance,
        closestAuthorPair,
        authorDistance: closestDistance,
        percentageDifference,
      });

      logger.info(
        `  ${modelDist.entityA} ↔ ${modelDist.entityB}:\n` +
        `    Raw distance: ${modelDist.distance.toFixed(4)} → Normalized: ${modelNorm.toFixed(3)}\n` +
        `    ≈ ${closestAuthorPair[0]} ↔ ${closestAuthorPair[1]}\n` +
        `    Raw distance: ${closestDistance.toFixed(4)} → Normalized: ${closestNormalizedDistance.toFixed(3)}\n` +
        `    Match quality: ${(100 - smallestNormalizedDifference * 100).toFixed(1)}% on normalized scale`,
      );
    }
  }

  return { closestAuthorPairs };
}

/**
 * Main analysis function that orchestrates the entire workflow
 */
export async function runAuthorDistanceAnalysis(
  passages: AuthorPassage[],
  candidateModels: string[],
  options: {
    embeddingModel?: string;
    extractorModel?: string;
    samplesPerPrompt?: number;
    temperature?: number;
  } = {},
): Promise<AuthorDistanceAnalysisResult> {
  const { logger } = getConfig();

  const embeddingModel = options.embeddingModel || 'openai:text-embedding-3-small';
  const extractorModel = options.extractorModel || 'openai:gpt-4o-mini';
  const samplesPerPrompt = options.samplesPerPrompt || 3;
  const temperature = options.temperature || 0.7;

  logger.info(`\n${'='.repeat(80)}`);
  logger.info(`AUTHOR DISTANCE ANALYSIS`);
  logger.info(`${'='.repeat(80)}`);

  const authors = [...new Set(passages.map(p => p.author))];
  logger.info(`\nAuthors: ${authors.join(', ')}`);
  logger.info(`Models: ${candidateModels.join(', ')}`);
  logger.info(`Embedding Model: ${embeddingModel}`);
  logger.info(`Extractor Model: ${extractorModel}`);
  logger.info(`Samples per Prompt: ${samplesPerPrompt}`);

  // Step 1: Extract prompts
  const extractedPrompts = await extractPromptsFromPassages(passages, extractorModel);

  // Step 2: Generate model responses
  const modelResponses = await generateModelResponses(extractedPrompts, candidateModels, samplesPerPrompt, temperature);

  // Step 3: Embed everything
  const embeddings = await embedAllTexts(passages, modelResponses, embeddingModel);

  // Step 4: Calculate distances
  const distances = calculateDistances(embeddings, authors, candidateModels);

  // Step 5: Interpret results
  const interpretation = interpretResults(distances);

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      embeddingModel,
      extractorModel,
      candidateModels,
      authors,
      samplesPerPrompt,
    },
    extractedPrompts,
    embeddings,
    distances,
    interpretation,
  };
}
