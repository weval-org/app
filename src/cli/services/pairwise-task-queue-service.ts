import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { SimpleLogger } from '@/lib/blueprint-service';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import { ConversationMessage } from '@/types/shared';
import { parseModelIdForApiCall } from '@/app/utils/modelIdUtils';
import pLimit from '@/lib/pLimit';

const TASK_QUEUE_BLOB_STORE_NAME = 'pairwise-tasks-v2';
const GENERATION_STATUS_BLOB_STORE_NAME = 'pairwise-generation-status';
const TASK_INDEX_KEY = '_index';
const IDEAL_MODEL_ID = 'IDEAL_MODEL_ID';
const OFFICIAL_ANCHOR_MODEL = 'openrouter:openai/gpt-4.1-mini';

// Helper to get config-specific index key
function getConfigIndexKey(configId: string): string {
    return `_index_${configId}`;
}

let netlifyToken: string | null = null;

// Helper function to generate SHA256 hash
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// Manually construct blob store credentials for local CLI execution
// This allows the CLI to run outside of the `netlify dev` environment.
async function getBlobStore(options?: { storeName?: string, siteId?: string, context?: any }) {
    console.log('[getBlobStore] Starting, options:', options);
    const { getStore, getDeployStore } = await import('@netlify/blobs');
    const storeName = options?.storeName || TASK_QUEUE_BLOB_STORE_NAME;
    const siteIdOverride = options?.siteId;
    const netlifyContext = options?.context;

    if (siteIdOverride) {
        console.log('[getBlobStore] Using siteId override:', siteIdOverride);
        if (!netlifyToken) {
            try {
                const globalConfigPath = path.join(os.homedir(), '.netlify', 'config.json');
                const configData = await fs.readFile(globalConfigPath, 'utf-8');
                const config = JSON.parse(configData);
                netlifyToken = config['access-token'];
                if (!netlifyToken) {
                    throw new Error('Netlify access token not found in global config.');
                }
            } catch (error: any) {
                throw new Error(`Failed to get Netlify token for siteId override: ${error.message}`);
            }
        }
        console.warn(`[PairwiseQueueService] Overriding site ID with provided: ${siteIdOverride}`);
        return getStore({
            name: storeName,
            siteID: siteIdOverride,
            token: netlifyToken,
        });
    }

    if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
        console.log('[getBlobStore] Using env vars - SITE_ID:', process.env.NETLIFY_SITE_ID, 'TOKEN:', process.env.NETLIFY_AUTH_TOKEN?.substring(0, 10) + '...');
        return getStore({
            name: storeName,
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_AUTH_TOKEN,
        });
    }

    console.log('[getBlobStore] Env vars not found, trying filesystem...');
    // Fallback for local CLI execution without override
    try {
        const stateConfigPath = path.join(process.cwd(), '.netlify', 'state.json');
        const stateData = await fs.readFile(stateConfigPath, 'utf-8');
        const siteId = JSON.parse(stateData).siteId;

        if (!netlifyToken) {
            const globalConfigPath = path.join(os.homedir(), '.netlify', 'config.json');
            const configData = await fs.readFile(globalConfigPath, 'utf-8');
            const config = JSON.parse(configData);
            netlifyToken = config['access-token'];
        }

        if (siteId && netlifyToken) {
            console.log('[getBlobStore] Using filesystem credentials - siteId:', siteId);
            return getStore({
                name: storeName,
                siteID: siteId,
                token: netlifyToken,
            });
        }
    } catch (error: any) {
        console.log('[getBlobStore] Filesystem fallback failed:', error.message);
    }

    // Final fallback: use Netlify context if available
    if (netlifyContext) {
        console.log('[getBlobStore] Using provided Netlify context');
        return getStore({ name: storeName, context: netlifyContext });
    }

    // Try Netlify Deploy Store (automatic in some production contexts)
    console.log('[getBlobStore] Trying Netlify Deploy Store (getDeployStore)');
    try {
        return getDeployStore({ name: storeName });
    } catch (deployStoreError: any) {
        console.log('[getBlobStore] getDeployStore failed:', deployStoreError.message);
        console.log('[getBlobStore] Trying getStore with just name');
        // Last resort: try getStore with just name (works in some Netlify contexts)
        return getStore({ name: storeName });
    }
}

export interface PairwiseTask {
  taskId: string;
  prompt: {
    system: string | null;
    messages: ConversationMessage[];
  };
  responseA: string;
  responseB: string;
  modelIdA: string;
  modelIdB: string;
  configId: string;
  renderAs?: 'markdown' | 'html' | 'plaintext';
}

export interface GenerationStatus {
  status: 'pending' | 'generating' | 'complete' | 'error';
  message: string;
  timestamp: string;
  tasksGenerated?: number;
  totalTasksInQueue?: number;
  error?: string;
}

export async function populatePairwiseQueue(
    resultData: FetchedComparisonData,
    options: { logger: SimpleLogger, siteId?: string, context?: any }
): Promise<{ tasksAdded: number; totalTasksInQueue: number; anchorModelMissing?: boolean }> {
    const { logger, siteId, context } = options;
    logger.info('[PairwiseQueueService] Populating pairwise comparison task queue...');

    const store = await getBlobStore({ siteId, context });
    const existingGlobalIndex = await store.get(TASK_INDEX_KEY, { type: 'json' }) as string[] | undefined || [];

    const configId = resultData.configId;
    const configIndexKey = getConfigIndexKey(configId);
    const existingConfigIndex = await store.get(configIndexKey, { type: 'json' }) as string[] | undefined || [];

    const newTasks: PairwiseTask[] = [];

    if (!resultData.config || !resultData.promptContexts || !resultData.allFinalAssistantResponses) {
        logger.warn('[PairwiseQueueService] Result data is missing required fields (config, promptContexts, allFinalAssistantResponses). Skipping.');
        return { tasksAdded: 0, totalTasksInQueue: existingGlobalIndex.length };
    }

    // Log all unique models found across all prompts (with and without suffixes)
    const allModelsSet = new Set<string>();
    const allModelsBaseSet = new Set<string>();
    for (const promptId of resultData.promptIds) {
        const promptResponses = resultData.allFinalAssistantResponses[promptId];
        if (promptResponses) {
            Object.keys(promptResponses).forEach(modelId => {
                if (modelId !== IDEAL_MODEL_ID) {
                    allModelsSet.add(modelId);
                    allModelsBaseSet.add(parseModelIdForApiCall(modelId).originalModelId);
                }
            });
        }
    }
    const allModels = Array.from(allModelsSet);
    const allModelsBase = Array.from(allModelsBaseSet);
    logger.info(`[PairwiseQueueService] Found ${allModels.length} unique model variants across ${resultData.promptIds.length} prompts:`);
    allModels.slice(0, 10).forEach(modelId => logger.info(`  - ${modelId}`));
    if (allModels.length > 10) {
        logger.info(`  ... and ${allModels.length - 10} more`);
    }
    logger.info(`[PairwiseQueueService] Found ${allModelsBase.length} unique base models (after stripping suffixes):`);
    allModelsBase.forEach(baseId => logger.info(`  - ${baseId}`));
    logger.info(`[PairwiseQueueService] Required anchor model: ${OFFICIAL_ANCHOR_MODEL}`);
    logger.info(`[PairwiseQueueService] Anchor model present: ${allModelsBase.includes(OFFICIAL_ANCHOR_MODEL) ? 'YES ✓' : 'NO ✗'}`);

    let promptsWithAnchor = 0;
    let promptsWithoutAnchor = 0;

    for (const promptId of resultData.promptIds) {
        const promptResponses = resultData.allFinalAssistantResponses[promptId];
        if (!promptResponses) continue;

        const modelIds = Object.keys(promptResponses).filter(id => id !== IDEAL_MODEL_ID);
        const systemPrompt = resultData.modelSystemPrompts?.[modelIds[0]] || null;

        const promptContext = resultData.promptContexts[promptId];
        const messages: ConversationMessage[] = Array.isArray(promptContext)
            ? promptContext
            : [{ role: 'user', content: promptContext }];

        // Get render instructions from config
        const promptConfig = resultData.config.prompts?.find(p => p.id === promptId);
        const renderAs = promptConfig?.render_as || 'markdown';

        // Find anchor model by checking base IDs (stripping suffixes)
        const anchorModelId = modelIds.find(id => parseModelIdForApiCall(id).originalModelId === OFFICIAL_ANCHOR_MODEL);

        if (anchorModelId) {
            promptsWithAnchor++;
            const otherModels = modelIds.filter(id => id !== anchorModelId);
            for (const otherModel of otherModels) {
                const modelA = anchorModelId;  // Use the actual ID with suffix
                const modelB = otherModel;
                const responseA = promptResponses[modelA];
                const responseB = promptResponses[modelB];

                // Skip if responses are identical - no point comparing
                if (responseA === responseB) {
                    logger.info(`[PairwiseQueueService] Skipping task for prompt '${promptId}': ${modelA} and ${modelB} produced identical responses`);
                    continue;
                }

                const canonicalKey = [promptId, modelA, responseA, modelB, responseB].sort().join('|');
                const taskId = sha256(canonicalKey);

                newTasks.push({
                    taskId,
                    prompt: { system: systemPrompt, messages },
                    responseA,
                    responseB,
                    modelIdA: modelA,
                    modelIdB: modelB,
                    configId: resultData.configId,
                    renderAs,
                });
            }
        } else {
            promptsWithoutAnchor++;
            logger.warn(`[PairwiseQueueService] Official anchor model '${OFFICIAL_ANCHOR_MODEL}' not found for prompt '${promptId}' in run from config '${resultData.configId}'. No pairs will be generated for this prompt.`);
        }
    }

    // Check if ALL prompts are missing the anchor model
    if (promptsWithAnchor === 0 && promptsWithoutAnchor > 0) {
        logger.error(`[PairwiseQueueService] Cannot generate pairs: anchor model '${OFFICIAL_ANCHOR_MODEL}' not found in any of the ${promptsWithoutAnchor} prompts. Please run an evaluation that includes this model.`);
        return { tasksAdded: 0, totalTasksInQueue: existingGlobalIndex.length, anchorModelMissing: true };
    }

    const uniqueNewTasks = newTasks.filter(task => !existingGlobalIndex.includes(task.taskId));

    if (uniqueNewTasks.length > 0) {
        logger.info(`[PairwiseQueueService] Found ${uniqueNewTasks.length} new unique tasks to add.`);
        const limit = pLimit(20);
        let savedCount = 0;

        // Save tasks
        const savePromises = uniqueNewTasks.map(task => limit(async () => {
            await store.setJSON(task.taskId, task);
            savedCount++;
            if (savedCount % 100 === 0) {
                logger.info(`[PairwiseQueueService] ... saved ${savedCount} / ${uniqueNewTasks.length} tasks`);
            }
        }));
        await Promise.all(savePromises);

        // Update both global and config-specific indexes
        const newTaskIds = uniqueNewTasks.map(task => task.taskId);
        const updatedGlobalIndex = [...existingGlobalIndex, ...newTaskIds];
        const updatedConfigIndex = [...existingConfigIndex, ...newTaskIds];

        await Promise.all([
            store.setJSON(TASK_INDEX_KEY, updatedGlobalIndex),
            store.setJSON(configIndexKey, updatedConfigIndex)
        ]);

        logger.info(`[PairwiseQueueService] Finished saving ${uniqueNewTasks.length} tasks. Indexes updated (global: ${updatedGlobalIndex.length}, config: ${updatedConfigIndex.length}).`);
    } else {
        logger.info('[PairwiseQueueService] No new tasks to add.');
    }

    return { tasksAdded: uniqueNewTasks.length, totalTasksInQueue: existingGlobalIndex.length };
}

export async function deletePairwiseTasks(options: { configId?: string, logger: SimpleLogger, siteId?: string }): Promise<{ deletedCount: number }> {
    const { configId, logger, siteId } = options;

    let totalDeletedCount = 0;
    const storesToProcess = ['pairwise-tasks-v2', 'pairwise-tasks'];

    for (const storeName of storesToProcess) {
        logger.info(`[PairwiseQueueService] Processing store: ${storeName}`);

        const effectiveConfigId = storeName === 'pairwise-tasks-v2' ? configId : undefined;
        if (storeName === 'pairwise-tasks' && configId) {
            logger.warn(`[PairwiseQueueService] --config-id is ignored for legacy 'pairwise-tasks' store. All tasks in this store will be deleted.`);
        }

        const store = await getBlobStore({ storeName, siteId });

        // Handle legacy store
        if (storeName === 'pairwise-tasks') {
             const { blobs } = await store.list();
             if (blobs.length > 0) {
                 logger.info(`[PairwiseQueueService] Found ${blobs.length} legacy tasks to delete.`);
                 // Fire and forget deletion for legacy tasks
                 for (const blob of blobs) {
                     store.delete(blob.key);
                 }
                 totalDeletedCount += blobs.length;
             }
             continue;
        }

        // Handle v2 store with config-specific indexes
        if (effectiveConfigId) {
            logger.info(`[PairwiseQueueService] Deleting tasks for configId: ${effectiveConfigId}`);

            // Use config index to get tasks to delete
            const configIndexKey = getConfigIndexKey(effectiveConfigId);
            const configIndex = await store.get(configIndexKey, { type: 'json' }) as string[] | undefined || [];

            if (configIndex.length === 0) {
                logger.info(`[PairwiseQueueService] No tasks found for config: ${effectiveConfigId}`);
                continue;
            }

            logger.info(`[PairwiseQueueService] Found ${configIndex.length} tasks to delete for this config.`);

            // Delete tasks in parallel
            const limit = pLimit(20);
            const deletePromises = configIndex.map(taskId => limit(() => store.delete(taskId)));
            await Promise.all(deletePromises);

            // Update global index by removing config tasks
            const globalIndex = await store.get(TASK_INDEX_KEY, { type: 'json' }) as string[] | undefined || [];
            const configTaskSet = new Set(configIndex);
            const updatedGlobalIndex = globalIndex.filter(taskId => !configTaskSet.has(taskId));
            await store.setJSON(TASK_INDEX_KEY, updatedGlobalIndex);

            // Delete config index
            await store.delete(configIndexKey);

            // Delete generation status for this config
            const statusStore = await getBlobStore({ storeName: GENERATION_STATUS_BLOB_STORE_NAME, siteId });
            await statusStore.delete(effectiveConfigId);
            logger.info(`[PairwiseQueueService] Deleted generation status for config: ${effectiveConfigId}`);

            logger.info(`[PairwiseQueueService] Deleted ${configIndex.length} tasks and removed config index.`);
            totalDeletedCount += configIndex.length;
        } else {
            logger.info('[PairwiseQueueService] Deleting ALL tasks in the store.');

            const globalIndex = await store.get(TASK_INDEX_KEY, { type: 'json' }) as string[] | undefined || [];
            if (globalIndex.length === 0) {
                logger.info(`[PairwiseQueueService] No tasks found. Nothing to delete.`);
                continue;
            }

            // Delete all tasks
            const limit = pLimit(20);
            const deletePromises = globalIndex.map(taskId => limit(() => store.delete(taskId)));
            await Promise.all(deletePromises);

            // Delete global index
            await store.delete(TASK_INDEX_KEY);

            // Delete all config indexes
            const { blobs } = await store.list();
            const configIndexes = blobs.filter(b => b.key.startsWith('_index_'));
            for (const configIndex of configIndexes) {
                await store.delete(configIndex.key);
            }

            // Delete all generation statuses
            const statusStore = await getBlobStore({ storeName: GENERATION_STATUS_BLOB_STORE_NAME, siteId });
            const { blobs: statusBlobs } = await statusStore.list();
            if (statusBlobs.length > 0) {
                logger.info(`[PairwiseQueueService] Deleting ${statusBlobs.length} generation status records...`);
                for (const statusBlob of statusBlobs) {
                    await statusStore.delete(statusBlob.key);
                }
            }

            logger.info(`[PairwiseQueueService] Deleted ${globalIndex.length} tasks, global index, ${configIndexes.length} config indexes, and all generation statuses.`);
            totalDeletedCount += globalIndex.length;
        }
    }

    return { deletedCount: totalDeletedCount };
}

export async function updateGenerationStatus(
    configId: string,
    status: GenerationStatus,
    options?: { siteId?: string, context?: any }
): Promise<void> {
    const store = await getBlobStore({
        storeName: GENERATION_STATUS_BLOB_STORE_NAME,
        siteId: options?.siteId,
        context: options?.context
    });
    await store.setJSON(configId, status);
}

export async function getGenerationStatus(
    configId: string,
    options?: { siteId?: string, context?: any }
): Promise<GenerationStatus | null> {
    console.log('[getGenerationStatus] Starting for configId:', configId);
    try {
        console.log('[getGenerationStatus] Getting blob store...');
        const store = await getBlobStore({
            storeName: GENERATION_STATUS_BLOB_STORE_NAME,
            siteId: options?.siteId,
            context: options?.context
        });
        console.log('[getGenerationStatus] Got store, fetching status...');
        const status = await store.get(configId, { type: 'json' }) as GenerationStatus | undefined;
        console.log('[getGenerationStatus] Status:', status);
        return status || null;
    } catch (error: any) {
        console.error('[getGenerationStatus] Error:', error.message);
        console.error('[getGenerationStatus] Stack:', error.stack);
        throw error;
    }
}

export async function getConfigTaskCount(
    configId: string,
    options?: { siteId?: string, context?: any }
): Promise<number> {
    console.log('[getConfigTaskCount] Starting for configId:', configId);
    try {
        console.log('[getConfigTaskCount] Getting blob store...');
        const store = await getBlobStore({ siteId: options?.siteId, context: options?.context });

        const configIndexKey = getConfigIndexKey(configId);
        console.log('[getConfigTaskCount] Fetching config index:', configIndexKey);
        const configIndex = await store.get(configIndexKey, { type: 'json' }) as string[] | undefined || [];

        console.log('[getConfigTaskCount] Config index length:', configIndex.length);
        return configIndex.length;
    } catch (error: any) {
        console.error('[getConfigTaskCount] Error:', error.message);
        console.error('[getConfigTaskCount] Stack:', error.stack);
        throw error;
    }
}