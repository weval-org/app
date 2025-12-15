import { Command } from 'commander';
import { getConfig } from '../config';
import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
    saveAutocompleteIndex,
} from '../../lib/storageService';
import { WevalResult } from '@/types/shared';
import { AutocompleteEntry } from '../types/cli_types';
import { getModelResponse } from '../services/llm-service';
import pLimit from '@/lib/pLimit';

const KEYWORD_EXTRACTOR_MODEL = 'openrouter:google/gemini-2.5-flash';

// Config ID prefixes that indicate non-public evaluations
// - Reserved prefixes from blueprint-parser.ts: _pr_, _staging_, _test_
// - API runs: api-run-*
// - Sandbox runs: sandbox-*
const EXCLUDED_CONFIG_ID_PREFIXES = ['_pr_', '_staging_', '_test_', 'api-run-', 'sandbox-'];

// Tags that indicate non-public/internal evaluations
const EXCLUDED_TAGS = ['_test', '_sandbox_test'];

const KEYWORD_EXTRACTION_SYSTEM_PROMPT = `You are a keyword extraction assistant for a search autocomplete system. Your job is to extract searchable terms that will help users find AI model evaluations even when they can't remember exact titles.

Given information about an AI evaluation, extract:
1. Key topics and themes (e.g., "medical advice", "legal reasoning", "education")
2. Related concepts and synonyms (e.g., if about "tutoring", include "teaching", "learning", "pedagogy")
3. Domain-specific terms (e.g., "clinical", "regulatory", "crisis response")
4. Action words describing what's being tested (e.g., "accuracy", "safety", "bias", "hallucination")

Return ONLY a JSON array of lowercase strings, 10-20 keywords. No explanation, just the array.
Example: ["medical", "clinical", "healthcare", "diagnosis", "patient", "safety", "accuracy", "treatment", "advice"]`;

async function extractKeywords(
    title: string,
    description: string,
    tags: string[],
    executiveSummary: string | undefined,
    logger: ReturnType<typeof getConfig>['logger']
): Promise<{ keywords: string[]; domain?: string }> {
    const prompt = `Evaluation Title: ${title}

Description: ${description}

Tags: ${tags.join(', ')}

${executiveSummary ? `Executive Summary (excerpt): ${executiveSummary.slice(0, 1500)}` : ''}

Extract searchable keywords for this AI evaluation:`;

    try {
        const response = await getModelResponse({
            modelId: KEYWORD_EXTRACTOR_MODEL,
            systemPrompt: KEYWORD_EXTRACTION_SYSTEM_PROMPT,
            prompt,
            temperature: 0.2,
            maxTokens: 500,
            useCache: true,
        });

        // Parse the JSON array from the response
        const jsonMatch = response.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
            const keywords = JSON.parse(jsonMatch[0]) as string[];
            // Infer domain from keywords or tags
            const domainKeywords: Record<string, string[]> = {
                medical: ['medical', 'clinical', 'health', 'patient', 'diagnosis', 'treatment'],
                legal: ['legal', 'law', 'court', 'judicial', 'rights', 'regulation'],
                education: ['education', 'teaching', 'learning', 'tutoring', 'pedagogy', 'student'],
                safety: ['safety', 'harm', 'risk', 'dangerous', 'crisis'],
                regional: ['regional', 'local', 'cultural', 'geographic', 'country'],
                technology: ['code', 'programming', 'software', 'technical', 'api'],
            };

            let domain: string | undefined;
            for (const [d, domainTerms] of Object.entries(domainKeywords)) {
                if (keywords.some(k => domainTerms.includes(k.toLowerCase())) ||
                    tags.some(t => domainTerms.includes(t.toLowerCase()))) {
                    domain = d;
                    break;
                }
            }

            return { keywords: keywords.map(k => k.toLowerCase()), domain };
        }

        logger.warn(`Could not parse keywords from LLM response for "${title}"`);
        return { keywords: [] };
    } catch (error: any) {
        logger.warn(`Failed to extract keywords for "${title}": ${error.message}`);
        return { keywords: [] };
    }
}

function isInternalConfig(configId: string, tags: string[] | undefined): boolean {
    // Check config ID prefix
    if (EXCLUDED_CONFIG_ID_PREFIXES.some(prefix => configId.startsWith(prefix))) {
        return true;
    }
    // Check tags
    if (tags && tags.some(tag => EXCLUDED_TAGS.includes(tag))) {
        return true;
    }
    return false;
}

async function actionGenerateAutocompleteIndex(options: {
    verbose?: boolean;
    dryRun?: boolean;
    concurrency?: string;
}) {
    const { logger } = getConfig();
    const concurrency = parseInt(options.concurrency || '5', 10);

    logger.info('Starting autocomplete index generation process...');
    logger.info(`Concurrency: ${concurrency}`);
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE --- No file will be written.');
    }

    try {
        const configIds = await listConfigIds();
        if (!configIds || configIds.length === 0) {
            logger.warn('No configuration IDs found. Nothing to index.');
            return;
        }

        logger.info(`Found ${configIds.length} configuration ID(s) to scan.`);

        // First pass: filter by config ID prefix (fast, no S3 calls)
        let skippedInternal = 0;
        const nonInternalConfigIds = configIds.filter(configId => {
            if (EXCLUDED_CONFIG_ID_PREFIXES.some(prefix => configId.startsWith(prefix))) {
                skippedInternal++;
                if (options.verbose) logger.info(`  [skip] Internal config: ${configId}`);
                return false;
            }
            return true;
        });

        logger.info(`After filtering internal configs: ${nonInternalConfigIds.length} (skipped ${skippedInternal})`);

        // Second pass: collect eligible configs (with runs)
        const eligibleConfigs: { configId: string; latestRunInfo: { fileName: string; timestamp: string } }[] = [];
        let skippedNoRuns = 0;
        let skippedNoTimestamp = 0;

        for (const configId of nonInternalConfigIds) {
            const runs = await listRunsForConfig(configId);

            if (runs.length === 0) {
                skippedNoRuns++;
                if (options.verbose) logger.info(`  [skip] No runs: ${configId}`);
                continue;
            }

            const latestRunInfo = runs[0];

            if (!latestRunInfo.timestamp) {
                skippedNoTimestamp++;
                if (options.verbose) logger.info(`  [skip] No timestamp: ${configId}`);
                continue;
            }

            eligibleConfigs.push({ configId, latestRunInfo: { fileName: latestRunInfo.fileName, timestamp: latestRunInfo.timestamp } });
        }

        logger.info(`Eligible configs: ${eligibleConfigs.length}`);
        logger.info(`Skipped: ${skippedNoRuns} no runs, ${skippedInternal} internal, ${skippedNoTimestamp} no timestamp`);

        if (eligibleConfigs.length === 0) {
            logger.warn('No eligible configurations to process.');
            return;
        }

        // Second pass: process eligible configs with progress tracking
        const limit = pLimit(concurrency);
        let completed = 0;
        let failed = 0;
        const total = eligibleConfigs.length;

        const tasks = eligibleConfigs.map(({ configId, latestRunInfo }) =>
            limit(async (): Promise<AutocompleteEntry | null> => {
                try {
                    const resultData = await getResultByFileName(configId, latestRunInfo.fileName) as WevalResult;
                    if (!resultData) {
                        failed++;
                        logger.warn(`  [${completed + failed}/${total}] Failed to fetch: ${configId}`);
                        return null;
                    }

                    // Double-check internal tags from result data
                    const resultTags = resultData.config?.tags;
                    if (isInternalConfig(configId, resultTags)) {
                        completed++;
                        if (options.verbose) logger.info(`  [${completed + failed}/${total}] Skipped internal: ${configId}`);
                        return null;
                    }

                    const title = resultData.configTitle || configId;
                    const description = resultData.config?.description || '';
                    const tags = (resultTags || []).filter(t => !t.startsWith('_'));
                    const executiveSummary = resultData.executiveSummary?.content;

                    const { keywords, domain } = await extractKeywords(
                        title,
                        description,
                        tags,
                        executiveSummary,
                        logger
                    );

                    // Find best performing model from hybrid scores
                    let topModel: string | undefined;
                    let topScore: number | undefined;

                    const perModelScores = resultData.evaluationResults?.perModelHybridScores;
                    if (perModelScores) {
                        let bestScore = -1;
                        const entries = perModelScores instanceof Map
                            ? Array.from(perModelScores.entries())
                            : Object.entries(perModelScores);

                        for (const [modelId, scoreData] of entries) {
                            const avg = typeof scoreData === 'object' && scoreData !== null
                                ? (scoreData as { average: number | null }).average
                                : null;
                            if (typeof avg === 'number' && avg > bestScore) {
                                bestScore = avg;
                                topModel = modelId.split(':').pop() || modelId;
                                topScore = avg;
                            }
                        }
                    }

                    completed++;
                    const keywordPreview = keywords.slice(0, 4).join(', ') + (keywords.length > 4 ? '...' : '');
                    logger.info(`  [${completed + failed}/${total}] ${title} → ${keywords.length} keywords (${keywordPreview})`);

                    return {
                        configId,
                        title,
                        tags,
                        snippet: description.slice(0, 150).trim() + (description.length > 150 ? '...' : ''),
                        keywords,
                        domain,
                        topModel,
                        score: topScore,
                    };
                } catch (error: any) {
                    failed++;
                    logger.warn(`  [${completed + failed}/${total}] Error processing ${configId}: ${error.message}`);
                    return null;
                }
            })
        );

        const allEntries = (await Promise.all(tasks)).filter((entry): entry is AutocompleteEntry => entry !== null);

        logger.info('');
        logger.info(`Processing complete: ${completed} succeeded, ${failed} failed.`);

        if (options.dryRun) {
            if (allEntries.length > 0) {
                logger.info(`[DRY RUN] Would save an autocomplete index with ${allEntries.length} entries.`);
                logger.info(`[DRY RUN] First entry example: ${JSON.stringify(allEntries[0], null, 2)}`);
            } else {
                logger.info(`[DRY RUN] No entries to save.`);
            }
        } else {
            if (allEntries.length > 0) {
                const fileSizeInBytes = await saveAutocompleteIndex(allEntries);
                const fileSizeInKB = (fileSizeInBytes / 1024).toFixed(2);
                logger.success(`Successfully saved autocomplete index with ${allEntries.length} entries.`);
                logger.info(`Generated file size: ${fileSizeInKB} KB`);
            } else {
                logger.info('No entries to generate. Autocomplete index not saved.');
            }
        }

        logger.info('--- Autocomplete Index Generation Complete ---');

    } catch (error: any) {
        logger.error(`An error occurred during index generation: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
    }
}

export const generateAutocompleteIndexCommand = new Command('generate-autocomplete-index')
    .description('Generates a lightweight autocomplete index with LLM-extracted keywords.')
    .option('-v, --verbose', 'Enable verbose logging.')
    .option('--dry-run', 'Log what would be generated without saving.')
    .option('--concurrency <number>', 'Number of concurrent LLM calls (default: 5)', '5')
    .action(actionGenerateAutocompleteIndex);
