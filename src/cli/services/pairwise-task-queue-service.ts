import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { SimpleLogger } from '@/lib/blueprint-service';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import { ConversationMessage } from '@/types/shared';

const TASK_QUEUE_BLOB_STORE_NAME = 'pairwise-tasks-v2';
const TASK_INDEX_KEY = '_index';
const IDEAL_MODEL_ID = 'IDEAL_MODEL_ID';
const OFFICIAL_ANCHOR_MODEL = 'openrouter:openai/gpt-4.1-mini';
import pLimit from '@/lib/pLimit';

let netlifyToken: string | null = null;

// Helper function to generate SHA256 hash
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// Manually construct blob store credentials for local CLI execution
// This allows the CLI to run outside of the `netlify dev` environment.
async function getBlobStore(options?: { storeName?: string, siteId?: string }) {
    const { getStore } = await import('@netlify/blobs');
    const storeName = options?.storeName || TASK_QUEUE_BLOB_STORE_NAME;
    const siteIdOverride = options?.siteId;

    if (siteIdOverride) {
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
        return getStore({
            name: storeName,
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_AUTH_TOKEN,
        });
    }

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
            return getStore({
                name: storeName,
                siteID: siteId,
                token: netlifyToken,
            });
        }
    } catch (error: any) {
        // This is not a critical error if running in a proper Netlify env
    }
    
    // Final fallback to anonymous store if no credentials can be found
    return getStore(storeName);
}

export interface PairwiseTask {
  taskId: string;
  prompt: {
    system: string | null;
    messages: ConversationMessage[];
  };
  responseA: string;
  responseB: string;
  configId: string;
}

export async function populatePairwiseQueue(
    resultData: FetchedComparisonData,
    options: { logger: SimpleLogger, siteId?: string }
): Promise<{ tasksAdded: number; totalTasksInQueue: number }> {
    const { logger, siteId } = options;
    logger.info('[PairwiseQueueService] Populating pairwise comparison task queue...');

    const store = await getBlobStore({ siteId });
    const existingIndex = await store.get(TASK_INDEX_KEY, { type: 'json' }) as string[] | undefined || [];
    let updatedIndex = [...existingIndex];
    
    const newTasks: PairwiseTask[] = [];

    if (!resultData.config || !resultData.promptContexts || !resultData.allFinalAssistantResponses) {
        logger.warn('[PairwiseQueueService] Result data is missing required fields (config, promptContexts, allFinalAssistantResponses). Skipping.');
        return { tasksAdded: 0, totalTasksInQueue: existingIndex.length };
    }

    for (const promptId of resultData.promptIds) {
        const promptResponses = resultData.allFinalAssistantResponses[promptId];
        if (!promptResponses) continue;

        const modelIds = Object.keys(promptResponses).filter(id => id !== IDEAL_MODEL_ID);
        const systemPrompt = resultData.modelSystemPrompts?.[modelIds[0]] || null;

        const promptContext = resultData.promptContexts[promptId];
        const messages: ConversationMessage[] = Array.isArray(promptContext)
            ? promptContext
            : [{ role: 'user', content: promptContext }];

        if (modelIds.includes(OFFICIAL_ANCHOR_MODEL)) {
            const otherModels = modelIds.filter(id => id !== OFFICIAL_ANCHOR_MODEL);
            for (const otherModel of otherModels) {
                const modelA = OFFICIAL_ANCHOR_MODEL;
                const modelB = otherModel;
                const responseA = promptResponses[modelA];
                const responseB = promptResponses[modelB];

                const canonicalKey = [promptId, modelA, responseA, modelB, responseB].sort().join('|');
                const taskId = sha256(canonicalKey);

                newTasks.push({
                    taskId,
                    prompt: { system: systemPrompt, messages },
                    responseA,
                    responseB,
                    configId: resultData.configId,
                });
            }
        } else {
            logger.warn(`[PairwiseQueueService] Official anchor model '${OFFICIAL_ANCHOR_MODEL}' not found for prompt '${promptId}' in run from config '${resultData.configId}'. No pairs will be generated for this prompt.`);
        }
    }

    const uniqueNewTasks = newTasks.filter(task => !existingIndex.includes(task.taskId));
    
    if (uniqueNewTasks.length > 0) {
        logger.info(`[PairwiseQueueService] Found ${uniqueNewTasks.length} new unique tasks to add.`);
        const limit = pLimit(20);
        let savedCount = 0;

        const savePromises = uniqueNewTasks.map(task => limit(async () => {
            await store.setJSON(task.taskId, task);
            savedCount++;
            if (savedCount % 100 === 0) {
                logger.info(`[PairwiseQueueService] ... saved ${savedCount} / ${uniqueNewTasks.length} tasks`);
            }
        }));
        await Promise.all(savePromises);

        const newIndexEntries = uniqueNewTasks.map(task => task.taskId);
        updatedIndex = [...existingIndex, ...newIndexEntries];
        await store.setJSON(TASK_INDEX_KEY, updatedIndex);
        logger.info(`[PairwiseQueueService] Finished saving ${uniqueNewTasks.length} tasks. Index updated.`);
    } else {
        logger.info('[PairwiseQueueService] No new tasks to add.');
    }

    return { tasksAdded: uniqueNewTasks.length, totalTasksInQueue: updatedIndex.length };
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
        const existingIndex = await store.get(TASK_INDEX_KEY, { type: 'json' }) as string[] | undefined || [];

        if (existingIndex.length === 0 && storeName !== 'pairwise-tasks') {
            logger.info(`[PairwiseQueueService] No index found for store '${storeName}'. Nothing to delete.`);
            continue;
        }

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

        let tasksToDelete: string[];
        let remainingTasks: string[];

        if (effectiveConfigId) {
            logger.info(`[PairwiseQueueService] Deleting tasks for configId: ${effectiveConfigId}`);
            const tasksForConfig: string[] = [];
            const otherTasks: string[] = [];
            
            for (const taskId of existingIndex) {
                const task = await store.get(taskId, { type: 'json' }) as PairwiseTask | undefined;
                if (task && task.configId === effectiveConfigId) {
                    tasksForConfig.push(taskId);
                } else {
                    otherTasks.push(taskId);
                }
            }
            tasksToDelete = tasksForConfig;
            remainingTasks = otherTasks;
            logger.info(`[PairwiseQueueService] Found ${tasksToDelete.length} tasks to delete for this config.`);
        } else {
            logger.info('[PairwiseQueueService] Deleting ALL tasks in the store.');
            tasksToDelete = [...existingIndex];
            remainingTasks = [];
        }

        if (tasksToDelete.length > 0) {
            const limit = pLimit(20);
            const deletePromises = tasksToDelete.map(taskId => limit(() => store.delete(taskId)));
            await Promise.all(deletePromises);

            await store.setJSON(TASK_INDEX_KEY, remainingTasks);
            logger.info(`[PairwiseQueueService] Deleted ${tasksToDelete.length} tasks and updated index.`);
            totalDeletedCount += tasksToDelete.length;
        } else {
            logger.info('[PairwiseQueueService] No matching tasks to delete.');
        }
    }
    
    return { deletedCount: totalDeletedCount };
}