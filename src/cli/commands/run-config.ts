import { Command } from 'commander';
import { execSync } from 'child_process';

import { getConfig } from '../config';
import fs from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';

import {
    EvaluationMethod,
    ComparisonConfig,
} from '../types/comparison_v2';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import {
    getHomepageSummary,
    saveHomepageSummary,
    updateSummaryDataWithNewRun,
    getResultByFileName, // To fetch the result if executeComparisonPipeline only returns a key/path
    HomepageSummaryFileContent // Import the main type
} from '../../lib/storageService'; // Adjusted path
import {
    calculateHeadlineStats,
    calculatePotentialModelDrift
} from '../utils/summaryCalculationUtils'; // Import new calc utils

import { executeComparisonPipeline } from '../services/comparison-pipeline-service';
import { generateConfigContentHash } from '../../lib/hash-utils';
import { parseAndNormalizeBlueprint } from '../../lib/blueprint-parser';

type Logger = ReturnType<typeof getConfig>['logger'];

export async function resolveModelCollections(configModels: any[], collectionsRepoPath: string | undefined, logger: Logger): Promise<string[]> {
    const resolvedModels: string[] = [];
    
    const normalizedConfigModels: string[] = [];
    for (const modelEntry of configModels) {
        if (typeof modelEntry === 'string') {
            const correctedEntry = modelEntry.trim().replace(/\s*:\s*/, ':');
            if (modelEntry !== correctedEntry) {
                logger.warn(`Malformed model entry string '${modelEntry}' contains unexpected whitespace. Correcting to '${correctedEntry}'. Please fix this in your blueprint file.`);
            }
            normalizedConfigModels.push(correctedEntry);
        } else if (typeof modelEntry === 'object' && modelEntry !== null && !Array.isArray(modelEntry)) {
            const keys = Object.keys(modelEntry);
            if (keys.length === 1) {
                const provider = keys[0].trim();
                const modelNameValue = modelEntry[keys[0]];

                if (typeof modelNameValue === 'string') {
                    const modelName = modelNameValue.trim();
                    const corrected = `${provider}:${modelName}`;
                    logger.warn(`Found model entry as a key-value pair: ${JSON.stringify(modelEntry)}. Interpreting as '${corrected}'. For clarity, please use the string format "provider:model" in your blueprint.`);
                    normalizedConfigModels.push(corrected);
                } else {
                    logger.warn(`Invalid object entry in models array: Key '${provider}' has a non-string value. Skipping: ${JSON.stringify(modelEntry)}.`);
                }
            } else {
                logger.warn(`Invalid object entry in models array: Must have exactly one key (the provider). Found ${keys.length} keys. Skipping: ${JSON.stringify(modelEntry)}.`);
            }
        } else {
             logger.warn(`Invalid entry in models array found: ${JSON.stringify(modelEntry)}. It is not a string or a single key-value object. Skipping this entry.`);
        }
    }

    if (!collectionsRepoPath) {
        logger.info('No --collections-repo-path provided. Treating all model entries as literal IDs.');
        // Return only string models, filtering out any that might be collection placeholders which are unresolvable.
        return normalizedConfigModels.filter(m => {
            const isPlaceholder = typeof m === 'string' && !m.includes(':') && m.toUpperCase() === m;
            if (isPlaceholder) {
                logger.warn(`Model entry '${m}' looks like a collection placeholder, but it cannot be resolved without --collections-repo-path. It will be treated as a literal model ID.`);
            }
            return typeof m === 'string';
        });
    }

    logger.info(`Attempting to resolve model collections from local path: ${path.resolve(collectionsRepoPath)}`);

    for (const modelEntry of normalizedConfigModels) {
        if (typeof modelEntry === 'string' && !modelEntry.includes(':') && modelEntry.toUpperCase() === modelEntry) { // Placeholder: no colon, all caps
            logger.info(`Found model collection placeholder: '${modelEntry}'. Attempting to load from local collections path.`);
            const collectionFileName = `${modelEntry}.json`;
            const collectionFilePath = path.join(path.resolve(collectionsRepoPath), 'models', collectionFileName);
            
            try {
                logger.info(`Reading model collection file: ${collectionFilePath}`);
                const collectionContent = await fs.readFile(collectionFilePath, 'utf-8');
                const collectionArray = JSON.parse(collectionContent);

                if (Array.isArray(collectionArray) && collectionArray.every(m => typeof m === 'string')) {
                    logger.info(`Successfully loaded and parsed model collection '${modelEntry}' from ${collectionFilePath}. Found ${collectionArray.length} models.`);
                    resolvedModels.push(...collectionArray);
                } else {
                    const errorMsg = `Invalid format for local model collection '${modelEntry}' at ${collectionFilePath}. Expected a JSON array of strings.`;
                    logger.error(errorMsg);
                    throw new Error(errorMsg);
                }
            } catch (collectionError: any) {
                if (collectionError.code === 'ENOENT') {
                    const errorMsg = `Model collection file not found for placeholder '${modelEntry}' at expected path: ${collectionFilePath}. This is required when --collections-repo-path is specified.`;
                    logger.error(errorMsg);
                    throw new Error(errorMsg);
                } else {
                    const errorMsg = `Error reading or parsing local model collection '${modelEntry}' from ${collectionFilePath}: ${collectionError.message}`;
                    logger.error(errorMsg);
                    throw new Error(errorMsg);
                }
            }
        } else if (typeof modelEntry === 'string') {
            resolvedModels.push(modelEntry);
        }
    }
    return [...new Set(resolvedModels)]; // Deduplicate
}

export function validateRoleAlternation(messages: { role: string }[], promptId: string): void {
    let lastRole: 'user' | 'assistant' | null = null;
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.role === 'system') {
            continue; // Skip system messages for alternation check
        }
        if (message.role === 'user') {
            if (lastRole === 'user') {
                throw new Error(`Prompt ID '${promptId}', message ${i}: Invalid sequence. Two 'user' messages in a row.`);
            }
            lastRole = 'user';
        } else if (message.role === 'assistant') {
            if (lastRole === 'assistant') {
                throw new Error(`Prompt ID '${promptId}', message ${i}: Invalid sequence. Two 'assistant' messages in a row.`);
            }
            lastRole = 'assistant';
        }
    }
}

export function validatePrompts(prompts: ComparisonConfig['prompts'], logger: Logger): void {
    if (!Array.isArray(prompts)) {
        throw new Error("Config file missing or has invalid 'prompts' (must be an array).");
    }

    // Validate and transform prompts for multi-turn compatibility
    for (const promptConfig of prompts) {
        const hasPromptText = promptConfig.promptText && typeof promptConfig.promptText === 'string' && promptConfig.promptText.trim() !== '';
        const hasMessages = Array.isArray(promptConfig.messages) && promptConfig.messages.length > 0;

        if (!hasPromptText && !hasMessages) {
            throw new Error(`Prompt ID '${promptConfig.id}' must have either a valid 'promptText' or a non-empty 'messages' array.`);
        }
        if (hasPromptText && hasMessages) {
            throw new Error(`Prompt ID '${promptConfig.id}' cannot have both 'promptText' and 'messages' defined. Please use 'messages' for multi-turn or 'promptText' for single-turn.`);
        }

        if (hasPromptText && !hasMessages) {
            logger.info(`Prompt ID '${promptConfig.id}' uses 'promptText'. Converting to 'messages' format for internal processing.`);
            promptConfig.messages = [{ role: 'user', content: promptConfig.promptText! }];
        } else if (hasMessages) {
            // Validate messages array structure and content
            const messages = promptConfig.messages!;
            if (messages.length === 0) { // Should be caught by hasMessages, but for safety
                throw new Error(`Prompt ID '${promptConfig.id}' has an empty 'messages' array.`);
            }

            // Role validation for the first message
            const firstRole = messages[0].role;
            if (firstRole === 'assistant') {
                throw new Error(`Prompt ID '${promptConfig.id}': First message role cannot be 'assistant'. Must be 'user' or 'system'.`);
            }

            // Role validation for the last message
            const lastRole = messages[messages.length - 1].role;
            if (lastRole !== 'user') {
                throw new Error(`Prompt ID '${promptConfig.id}': Last message role in the input sequence must be 'user'. Found '${lastRole}'.`);
            }

            // Validate individual messages and role alternation
            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                if (!message.role || !['user', 'assistant', 'system'].includes(message.role)) {
                    throw new Error(`Prompt ID '${promptConfig.id}', message ${i}: Invalid role '${message.role}'. Must be 'user', 'assistant', or 'system'.`);
                }
                if (!message.content || typeof message.content !== 'string' || message.content.trim() === '') {
                    throw new Error(`Prompt ID '${promptConfig.id}', message ${i} (role '${message.role}'): Content cannot be empty.`);
                }
            }

            validateRoleAlternation(messages, promptConfig.id);
            
            logger.info(`Prompt ID '${promptConfig.id}' uses 'messages' format with ${messages.length} messages. Validation passed.`);
        }
    }
}

async function loadAndValidateConfig(configPath: string, collectionsRepoPath?: string): Promise<ComparisonConfig> {
    const { logger } = getConfig();
    logger.info(`Loading and validating config file: ${path.resolve(configPath)}`);
    if (collectionsRepoPath) {
        logger.info(`Attempting to resolve model collections from local path: ${path.resolve(collectionsRepoPath)}`);
    }
    
    let configContent;
    try {
        configContent = await fs.readFile(path.resolve(configPath), 'utf-8');
    } catch (fileReadError: any) {
        logger.error(`Failed to read configuration file at '${path.resolve(configPath)}'. Please ensure the file exists and has correct permissions.`);
        logger.error(`System error: ${fileReadError.message}`);
        throw fileReadError;
    }

    let configJson: ComparisonConfig;
    try {
        const fileType = (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) ? 'yaml' : 'json';
        configJson = parseAndNormalizeBlueprint(configContent, fileType);
    } catch (parseError: any) {
        logger.error(`Failed to parse or normalize configuration file at '${path.resolve(configPath)}'.`);
        logger.error(`System error: ${parseError.message}`);
        throw parseError;
    }
    
    // If ID is missing, derive it from the filename.
    if (!configJson.id) { // id is normalized from configId by the parser
        const rawFileName = path.basename(configPath);
        const id = rawFileName
            .replace(/\.civic\.ya?ml$/, '')
            .replace(/\.ya?ml$/, '')
            .replace(/\.json$/, '');
        logger.info(`'id' not found in blueprint. Deriving from filename: '${rawFileName}' -> '${id}'`);
        configJson.id = id;
    }

    // If title is missing, derive it from the ID.
    if (!configJson.title) {
        logger.info(`'title' not found in blueprint. Using derived or existing ID as title: '${configJson.id}'`);
        configJson.title = configJson.id;
    }

    // Now that ID and title are expected to be populated, we can validate them.
    if (!configJson.id || typeof configJson.id !== 'string' || configJson.id.trim() === '') {
        throw new Error("Failed to determine a valid 'id' for the blueprint from file content or filename.");
    }
    if (!configJson.title || typeof configJson.title !== 'string' || configJson.title.trim() === '') {
        throw new Error("Failed to determine a valid 'title' for the blueprint from file content or 'id'.");
    }

    if (!configJson.models || !Array.isArray(configJson.models) || configJson.models.length === 0) {
        logger.info('Models field is missing, not an array, or empty. Defaulting to ["CORE"].');
        configJson.models = ["CORE"];
    }

    validatePrompts(configJson.prompts, logger);
    
    logger.info(`Initial validation passed for configId '${configJson.id}'. Original models: [${configJson.models.join(', ')}]`);

    const originalModelsCount = configJson.models.length;
    configJson.models = await resolveModelCollections(configJson.models, collectionsRepoPath, logger);

    logger.info(`Final resolved models for blueprint ID '${configJson.id}': [${configJson.models.join(', ')}] (Count: ${configJson.models.length})`);
    if (originalModelsCount > 0 && configJson.models.length === 0) {
        logger.warn(`Blueprint file '${configPath}' resulted in an empty list of models after attempting to resolve collections. Original models: [${configJson.models.join(',')}]. Check blueprint and collection definitions.`);
    }

    // Post-resolution validation (other fields)
    if (configJson.description) {
        logger.info(`Description found in config: ${configJson.description.substring(0, 100)}...`);
    }
    if (configJson.temperature !== undefined && typeof configJson.temperature !== 'number') {
        throw new Error("Config file has invalid 'temperature'");
    }
    if (configJson.temperatures !== undefined && (!Array.isArray(configJson.temperatures) || !configJson.temperatures.every((t: any) => typeof t === 'number'))) {
        throw new Error("Config file has invalid 'temperatures'");
    }
    if (configJson.tags !== undefined) {
        if (!Array.isArray(configJson.tags) || !configJson.tags.every((tag: any) => typeof tag === 'string')) {
            throw new Error("Config file has an invalid 'tags' field (must be an array of strings if provided).");
        }
        logger.info(`Tags found in config: ${configJson.tags.join(', ')}`);
    }
    if (configJson.temperature !== undefined && configJson.temperature !== null &&
        Array.isArray(configJson.temperatures) && configJson.temperatures.length > 0) {
        logger.warn(`Warning: Both 'temperature' (value: ${configJson.temperature}) and a non-empty 'temperatures' array are defined. The 'temperature' field will be ignored.`);
    }

    logger.info(`Blueprint for '${configJson.id}' (Title: '${configJson.title}') loaded, validated, and models resolved successfully.`);
    return configJson;
}

function parseEvalMethods(evalMethodString: string | undefined): EvaluationMethod[] {
    if (!evalMethodString) return ['embedding'];

    const methods = evalMethodString.split(',').map(m => m.trim().toLowerCase()).filter(m => m);
    const validMethods: EvaluationMethod[] = ['embedding', 'llm-coverage'];
    const chosenMethods: EvaluationMethod[] = [];

    if (methods.includes('all')) {
        return validMethods;
    }

    methods.forEach((method) => {
        if (validMethods.includes(method as EvaluationMethod)) {
            chosenMethods.push(method as EvaluationMethod);
        } else {
            const logger = getConfig()?.logger;
            const logFn = logger ? logger.warn : console.warn;
            logFn(`[ParseEvalMethods] Invalid evaluation method ignored: ${method}`);
        }
    });
    
    if (chosenMethods.length === 0) {
        const logger = getConfig()?.logger;
        const logFn = logger ? logger.warn : console.warn;
        logFn('[ParseEvalMethods] No valid evaluation methods found or specified. Defaulting to embedding.');
        return ['embedding'];
    }
    return chosenMethods;
}

async function actionV2(options: { config: string, runLabel?: string, evalMethod?: string, cache?: boolean, collectionsRepoPath?: string }) {
    let loggerInstance: ReturnType<typeof getConfig>['logger'];
    try {
        const configService = getConfig();
        loggerInstance = configService.logger;
    } catch (e: any) {
        console.error('[CivicEval_RUN_CONFIG_CRITICAL] Error during initial logger setup:', e.message, e.stack);
        process.exit(1);
    }

    try {
        await loggerInstance.info(`CivicEval run_config CLI started. Options received: ${JSON.stringify(options)}`);
        
        const config = await loadAndValidateConfig(options.config, options.collectionsRepoPath);
        const currentConfigId = config.id!;
        const currentTitle = config.title!;
        
        await loggerInstance.info(`Loaded blueprint ID: '${currentConfigId}', Title: '${currentTitle}' with resolved models.`);

        let commitSha: string | undefined;
        if (options.collectionsRepoPath) {
            try {
                const repoPath = path.resolve(options.collectionsRepoPath);
                // Check if it's a git repository before running git command
                await fs.access(path.join(repoPath, '.git'));
                commitSha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
                loggerInstance.info(`Retrieved git commit SHA from collections repo: ${commitSha}`);
            } catch (gitError: any) {
                loggerInstance.warn(`Could not retrieve git commit SHA from ${options.collectionsRepoPath}: ${gitError.message}. This is expected if it's not a git repository.`);
                commitSha = undefined;
            }
        }

        let runLabel = options.runLabel?.trim();
        const contentHash = generateConfigContentHash(config); // Hash is now based on resolved models
        let finalRunLabel: string;

        if (runLabel) {
            finalRunLabel = `${runLabel}_${contentHash}`;
            await loggerInstance.info(`User provided runLabel '${options.runLabel?.trim()}', appended content hash. Final runLabel: '${finalRunLabel}'`);
        } else {
            finalRunLabel = contentHash;
            await loggerInstance.info(`--run-label not supplied. Using content hash as runLabel: '${finalRunLabel}'`);
        }
        
        if (!finalRunLabel) {
            throw new Error('Run label is unexpectedly empty after processing.');
        }
        if (config.models.length === 0) {
            loggerInstance.error('The final list of models to evaluate is empty. This can happen if model collections are specified but not resolved, or if the config itself has no models. Halting execution.');
            throw new Error('No models to evaluate after resolving collections.');
        }

        const chosenMethods = parseEvalMethods(options.evalMethod);
        await loggerInstance.info(`Evaluation methods to be used: ${chosenMethods.join(', ')}`);

        await loggerInstance.info('--- Run Blueprint Summary (Post Model Collection Resolution) ---');
        await loggerInstance.info(`Blueprint ID: ${currentConfigId}`);
        await loggerInstance.info(`Blueprint Title: ${currentTitle}`);
        await loggerInstance.info(`Run Label: ${finalRunLabel}`); 
        if (config.description) {
            await loggerInstance.info(`Description: ${config.description.substring(0, 200)}...`);
        }
        await loggerInstance.info(`Models to run: [${config.models.join(', ')}] (Count: ${config.models.length})`);
        await loggerInstance.info(`Number of Prompts: ${config.prompts.length}`);
        await loggerInstance.info(`Concurrency: ${config.concurrency || 10}`);
        await loggerInstance.info(`Evaluation Methods: ${chosenMethods.join(', ')}`);
        if (config.temperatures && config.temperatures.length > 0) {
            await loggerInstance.info(`Temperatures to run: ${config.temperatures.join(', ')}`);
        } else if (config.temperature !== undefined) {
            await loggerInstance.info(`Default Temperature: ${config.temperature}`);
        }
        await loggerInstance.info('-----------------------------------------------------------------');

        const ora = (await import('ora')).default;
        const mainSpinner = ora('Starting comparison pipeline with resolved models...').start();
        let outputPathOrKey: string | null = null; // To store the result path/key
        let newResultData: FetchedComparisonData | null = null; // To store the actual data object
        let actualResultFileName: string | null = null; // To store the definitive file name of the saved result

        try {
            mainSpinner.text = `Executing comparison pipeline for blueprint ID: ${currentConfigId}, runLabel: ${finalRunLabel}. Caching: ${options.cache ?? false}`;
            
            const pipelineResult = await executeComparisonPipeline(
                config, 
                finalRunLabel, 
                chosenMethods, 
                loggerInstance, 
                undefined, 
                undefined, 
                options.cache,
                commitSha,
            ); 

            // The pipeline now returns an object with the data and the filename/key it was saved under
            if (pipelineResult && typeof pipelineResult === 'object' && 'fileName' in pipelineResult && 'data' in pipelineResult) {
                newResultData = pipelineResult.data as FetchedComparisonData;
                actualResultFileName = pipelineResult.fileName;
                outputPathOrKey = actualResultFileName; // The filename is the key/path
            } else {
                // Fallback for older pipeline versions or local-only runs that might return just data
                if (typeof pipelineResult === 'object' && pipelineResult !== null) {
                    newResultData = pipelineResult as FetchedComparisonData;
                    // For local, non-S3 runs, a filename might not be returned, construct a conceptual one
                    outputPathOrKey = `local-result-for-config-${currentConfigId}-run-${finalRunLabel}`; 
                    if (process.env.STORAGE_PROVIDER === 's3') {
                        mainSpinner.warn('Pipeline returned data without a filename, but S3 provider is active. Summary update might fail if filename is required.');
                    }
                } else {
                     throw new Error('executeComparisonPipeline returned an unexpected or null result.');
                }
            }
            
            if (outputPathOrKey) {
              mainSpinner.succeed(`Comparison pipeline finished successfully! Results may be found at: ${outputPathOrKey}`);
            } else {
              mainSpinner.fail(`Comparison pipeline completed, but failed to save results or get a valid reference.`);
              process.exit(1);
            }
        } catch (pipelineError: any) {
            mainSpinner.fail(`Comparison pipeline failed: ${pipelineError.message}`);
            if (process.env.DEBUG && pipelineError.stack) {
                loggerInstance.error(`Pipeline stack trace: ${pipelineError.stack}`);
            }
            process.exit(1);
        }

        if (newResultData && (process.env.STORAGE_PROVIDER === 's3' || process.env.UPDATE_LOCAL_SUMMARY === 'true')) { // Only update if S3 or explicitly told for local
            try {
                loggerInstance.info('Attempting to update homepage summary manifest with new calculations...');
                const currentFullSummary = await getHomepageSummary(); // Fetches HomepageSummaryFileContent | null
                
                if (!actualResultFileName) {
                    throw new Error('Could not determine result filename for summary update. Result might not have been saved to a persistent location.');
                }

                // 1. Update the configs array part of the summary
                const updatedConfigsArray = updateSummaryDataWithNewRun(
                    currentFullSummary?.configs || null, // Pass only the configs array, or null if no current summary
                    newResultData, 
                    actualResultFileName
                );

                // --- BEGIN: Log Hybrid Score for the New Run ---
                loggerInstance.info('--- Newly Calculated Hybrid Scores ---');
                const newRunConfig = updatedConfigsArray.find(c => c.configId === newResultData.configId);
                if (newRunConfig) {
                    const newRun = newRunConfig.runs.find(r => r.runLabel === newResultData.runLabel && r.timestamp === newResultData.timestamp);
                    if (newRun && newRun.perModelHybridScores) {
                        loggerInstance.info(`Overall Run Hybrid Score Average: ${newRun.hybridScoreStats?.average?.toFixed(4)}`);
                        loggerInstance.info('Per-Model Hybrid Score Averages:');
                        const scoresToLog: Record<string, string> = {};
                        newRun.perModelHybridScores.forEach((stats, modelId) => {
                           scoresToLog[modelId] = stats.average !== null && stats.average !== undefined ? stats.average.toFixed(4) : 'N/A';
                        });
                        // Use console.table for nice formatting if possible, otherwise just log the object
                        if (typeof console.table === 'function') {
                            console.table(scoresToLog);
                        } else {
                            loggerInstance.info(JSON.stringify(scoresToLog, null, 2));
                        }
                    } else {
                        loggerInstance.warn('Could not find the specific new run in the updated summary to log its hybrid scores.');
                    }
                } else {
                    loggerInstance.warn('Could not find the new run\'s config in the updated summary to log its hybrid scores.');
                }
                loggerInstance.info('------------------------------------');
                // --- END: Log Hybrid Score for the New Run ---

                // Filter out configs with 'test' tag before calculating aggregate stats
                // These stats are for public consumption, so 'test' items should always be excluded from the *calculation*
                // of the globally cached/stored homepage summary.
                const configsForStatsCalculation = updatedConfigsArray.filter(
                    config => !(config.tags && config.tags.includes('test'))
                );
                loggerInstance.info(`Total configs for summary: ${updatedConfigsArray.length}. Configs after filtering 'test' tags for stats calculation: ${configsForStatsCalculation.length}`);

                // 2. Recalculate headlineStats and driftDetectionResult using the newly updated configs array
                const newHeadlineStats = calculateHeadlineStats(configsForStatsCalculation);
                const newDriftDetectionResult = calculatePotentialModelDrift(configsForStatsCalculation);

                // 3. Construct the complete new HomepageSummaryFileContent object
                const newHomepageSummaryContent: HomepageSummaryFileContent = {
                    configs: updatedConfigsArray,
                    headlineStats: newHeadlineStats,
                    driftDetectionResult: newDriftDetectionResult,
                    lastUpdated: new Date().toISOString(),
                };

                await saveHomepageSummary(newHomepageSummaryContent);
                loggerInstance.info('Homepage summary manifest updated successfully with re-calculated stats.');
            } catch (summaryError: any) {
                loggerInstance.error(`Failed to update homepage summary manifest: ${summaryError.message}`);
                if (process.env.DEBUG && summaryError.stack) {
                    loggerInstance.error(`Summary update stack trace: ${summaryError.stack}`);
                }
                // Do not exit process here, as the main run was successful.
            }
        } else {
            loggerInstance.info('Skipping homepage summary manifest update (not S3 provider or not explicitly enabled for local).');
        }

        await loggerInstance.info('CivicEval run_config command finished successfully.');
    } catch (error: any) {
        loggerInstance.error(`Top-level error in CivicEval run_config action: ${error.message}`);
        if (process.env.DEBUG && error.stack) {
            loggerInstance.error(`Overall stack trace: ${error.stack}`);
        }
        // Ensure spinner is stopped on error
        try {
            // If mainSpinner is in scope and is an ora instance, stop it directly.
            // However, mainSpinner is defined in the try block above and not accessible here.
            // Revert to a simpler way to stop any active ora spinner, similar to original handling.
            const ora = (await import('ora')).default;
            ora().stop(); // Assumes ora().stop() can halt any active spinner from the library.
        } catch (spinnerError: any) {
            loggerInstance.warn(`Could not stop ora spinner on error: ${spinnerError.message}`);
        }
        process.exit(1);
    }
}

export const runConfigCommand = new Command('run_config')
    .description('Runs response generation and configurable evaluations based on a JSON blueprint file. Can resolve model collections from a local path.')
    .requiredOption('-c, --config <path>', 'Path to the JSON blueprint file')
    .option('-r, --run-label <runLabelValue>', 'A unique label for this specific execution run. If not provided, a label will be generated based on the blueprint content.')
    .option('--eval-method <methods>', "Comma-separated evaluation methods (embedding, llm-coverage, all)")
    .option('--cache', 'Enable caching for model responses (defaults to false).')
    .option('--collections-repo-path <path>', 'Path to your local checkout of the civiceval/configs repository (or a similar structure) to resolve model collections from its "models" subdirectory. The evaluation blueprints themselves are expected in a "blueprints" subdirectory within this path if not using direct GitHub fetching.')
    .action(actionV2); 