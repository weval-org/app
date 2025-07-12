import { Command } from 'commander';
import { execSync } from 'child_process';

import { getConfig } from '../config';
import fs from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';

import {
    EvaluationMethod,
    ComparisonConfig,
} from '../types/cli_types';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import {
    getHomepageSummary,
    saveHomepageSummary,
    updateSummaryDataWithNewRun,
    getResultByFileName, // To fetch the result if executeComparisonPipeline only returns a key/path
    HomepageSummaryFileContent, // Import the main type
    getConfigSummary,
    saveConfigSummary,
    getLatestRunsSummary,
    saveLatestRunsSummary,
    LatestRunSummaryItem,
    getModelSummary,
    saveModelSummary,
} from '../../lib/storageService'; // Adjusted path
import {
    calculateHeadlineStats,
    calculatePotentialModelDrift
} from '../utils/summaryCalculationUtils'; // Import new calc utils

import { executeComparisonPipeline } from '../services/comparison-pipeline-service';
import { generateConfigContentHash } from '../../lib/hash-utils';
import { parseAndNormalizeBlueprint } from '../../lib/blueprint-parser';
import { fetchBlueprintContentByName, resolveModelsInConfig } from '../../lib/blueprint-service';
import { SimpleLogger } from '@/lib/blueprint-service';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { ModelRunPerformance, ModelSummary } from '@/types/shared';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { populatePairwiseQueue } from '../services/pairwise-task-queue-service';
import { normalizeTag } from '@/app/utils/tagUtils';
import { generateBlueprintIdFromPath } from '@/app/utils/blueprintIdUtils';

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

async function loadAndValidateConfig(options: {
    configPath?: string,
    configContent?: string,
    blueprintPath?: string,
    fileType?: 'json' | 'yaml',
    collectionsRepoPath?: string,
    isRemote?: boolean,
}): Promise<ComparisonConfig> {
    const { configPath, configContent, blueprintPath, fileType, collectionsRepoPath, isRemote } = options;
    const { logger } = getConfig();

    let content: string;
    let type: 'json' | 'yaml';
    let sourceName: string; // for logging and deriving ID

    if (configPath) {
        logger.info(`Loading and validating config file: ${path.resolve(configPath)}`);
        sourceName = configPath; // Use the full relative path for ID generation
        type = (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) ? 'yaml' : 'json';
        try {
            content = await fs.readFile(path.resolve(configPath), 'utf-8');
        } catch (fileReadError: any) {
            logger.error(`Failed to read configuration file at '${path.resolve(configPath)}'. Please ensure the file exists and has correct permissions.`);
            logger.error(`System error: ${fileReadError.message}`);
            throw fileReadError;
        }
    } else if (configContent && blueprintPath && fileType) {
        logger.info(`Loading and validating config from remote blueprint: ${blueprintPath}`);
        sourceName = blueprintPath;
        type = fileType;
        content = configContent;
    } else {
        throw new Error("loadAndValidateConfig requires either a configPath or configContent with a blueprintPath and fileType.");
    }

    if (collectionsRepoPath) {
        logger.info(`Attempting to resolve model collections from local path: ${path.resolve(collectionsRepoPath)}`);
    }
    
    let configJson: ComparisonConfig;
    try {
        configJson = parseAndNormalizeBlueprint(content, type);
    } catch (parseError: any) {
        logger.error(`Failed to parse or normalize configuration from source '${sourceName}'.`);
        logger.error(`System error: ${parseError.message}`);
        throw parseError;
    }
    
    // If an 'id' is present in the file, log a warning that it's being ignored.
    // The file path is now the single source of truth for the blueprint's ID.
    if (configJson.id) {
        logger.warn(`Blueprint source '${sourceName}' contains an 'id' field ('${configJson.id}'). This field is now deprecated and will be ignored. The blueprint's ID will be derived from its file path.`);
    }

    // Always derive the ID from the source path.
    const id = generateBlueprintIdFromPath(sourceName);

    logger.info(`Deriving blueprint ID from file path: '${sourceName}' -> '${id}'`);
    configJson.id = id;

    // If title is missing, derive it from the ID.
    if (!configJson.title) {
        logger.info(`'title' not found in blueprint. Using derived ID as title: '${configJson.id}'`);
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
    
    if (collectionsRepoPath) {
        logger.info(`--collections-repo-path provided. Resolving collections from local path: ${path.resolve(collectionsRepoPath)}`);
        configJson.models = await resolveModelCollections(configJson.models, collectionsRepoPath, logger);
    } else if (isRemote) {
        logger.info(`Resolving collections from GitHub for remote blueprint.`);
        const githubToken = process.env.GITHUB_TOKEN;
        const resolvedConfig = await resolveModelsInConfig(configJson, githubToken, logger as SimpleLogger);
        configJson.models = resolvedConfig.models;
    } else {
        // Local blueprint, no collections path specified. Let resolveModelCollections handle it (it will just process literals).
        configJson.models = await resolveModelCollections(configJson.models, undefined, logger);
    }

    logger.info(`Final resolved models for blueprint ID '${configJson.id}': [${configJson.models.join(', ')}] (Count: ${configJson.models.length})`);
    if (originalModelsCount > 0 && configJson.models.length === 0) {
        logger.warn(`Blueprint from ${sourceName} resulted in an empty list of models after attempting to resolve collections. Original models: [${configJson.models.join(',')}]. Check blueprint and collection definitions.`);
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
        const originalTags = [...configJson.tags];
        const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
        
        if (JSON.stringify(originalTags) !== JSON.stringify(normalizedTags)) {
            logger.info(`Original tags [${originalTags.join(', ')}] were normalized to [${normalizedTags.join(', ')}].`);
        } else {
            logger.info(`Tags found in config: ${normalizedTags.join(', ')}`);
        }
        configJson.tags = normalizedTags;
    }
    if (configJson.temperature !== undefined && configJson.temperature !== null &&
        Array.isArray(configJson.temperatures) && configJson.temperatures.length > 0) {
        logger.warn(`Warning: Both 'temperature' (value: ${configJson.temperature}) and a non-empty 'temperatures' array are defined. The 'temperature' field will be ignored.`);
    }

    // Handle system prompt aliasing and validation
    
    // If 'system' is an array, treat it as the 'systems' permutation array.
    if (Array.isArray(configJson.system)) {
        if (configJson.systems && configJson.systems.length > 0) {
            logger.warn(`Warning: Both 'system' (as an array) and 'systems' are defined. Using 'systems' and ignoring the array in 'system'.`);
        } else {
            logger.info(`Found 'system' field is an array. Treating it as the 'systems' array for permutation.`);
            configJson.systems = configJson.system;
        }
        // Unset 'system' to avoid conflicts and errors with code expecting a string.
        configJson.system = undefined;
    }

    // Handle legacy 'systemPrompt' field. This runs after we've potentially handled 'system' as an array.
    if (configJson.systemPrompt) {
        if (configJson.system) { // 'system' here would have to be a string.
            logger.warn(`Warning: Both 'system' (as a string) and legacy 'systemPrompt' are defined. Using 'system' and ignoring 'systemPrompt'.`);
        } else {
            logger.info(`Found legacy 'systemPrompt'. Mapping to 'system' for processing.`);
            configJson.system = configJson.systemPrompt;
        }
    }

    // Now 'system' can only be a string or undefined, and 'systems' can be an array or undefined.
    // This warning should be updated to reflect the new logic.
    if (configJson.system && Array.isArray(configJson.systems) && configJson.systems.length > 0) {
        logger.warn(`Warning: Both a singular 'system' prompt and a non-empty 'systems' array are defined. The singular 'system' prompt will be ignored in favor of permutation.`);
    }
    
    if (configJson.systems !== undefined && (!Array.isArray(configJson.systems) || !configJson.systems.every((s: any) => typeof s === 'string' || s === null))) {
        throw new Error("Config file has invalid 'systems' (must be an array of strings or nulls).");
    }

    if (Array.isArray(configJson.systems) && configJson.systems.filter(s => s === null).length > 1) {
        throw new Error("Config file validation error: The 'systems' array can contain at most one 'null' entry.");
    }

    // If a 'systems' array is defined for permutation, individual prompt-level system prompts are disallowed to ensure experimental hygiene.
    if (Array.isArray(configJson.systems) && configJson.systems.length > 0) {
        const promptWithSystemOverride = configJson.prompts.find(p => p.system);
        if (promptWithSystemOverride) {
            throw new Error(`Config validation error: When a top-level 'systems' array is defined for permutation, individual prompts (like '${promptWithSystemOverride.id}') cannot have their own 'system' override. This is to ensure a clean comparison across all system prompts.`);
        }
        logger.info(`'systems' array found for permutation. All prompts will be run against ${configJson.systems.length} system prompts.`);
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

interface RunOptions {
    runLabel?: string;
    evalMethod?: string;
    cache?: boolean;
    collectionsRepoPath?: string;
}

async function promptForConfig(): Promise<string> {
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;
    const { logger } = getConfig();
    
    logger.info(chalk.blue('🔧 Interactive Mode: Missing required parameter'));
    
    const { configPath } = await inquirer.prompt([{
        type: 'input',
        name: 'configPath',
        message: 'Enter the path to your local blueprint file (.yml, .yaml, or .json):',
        validate: (input: string) => {
            if (!input || input.trim() === '') {
                return 'Please enter a valid file path.';
            }
            return true;
        }
    }]);
    
    return configPath.trim();
}

async function promptForBlueprintName(): Promise<string> {
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;
    const { logger } = getConfig();
    
    logger.info(chalk.blue('🔧 Interactive Mode: Missing required parameter'));
    
    const { blueprintName } = await inquirer.prompt([{
        type: 'input',
        name: 'blueprintName',
        message: 'Enter the name of the blueprint from GitHub (e.g., "my-test-blueprint"):',
        validate: (input: string) => {
            if (!input || input.trim() === '') {
                return 'Please enter a valid blueprint name.';
            }
            return true;
        }
    }]);
    
    return blueprintName.trim();
}

async function runBlueprint(config: ComparisonConfig, options: RunOptions, commitSha?: string | null, blueprintFileName?: string) {
    const { logger: loggerInstance } = getConfig();

    try {
        const currentConfigId = config.id!;
        const currentTitle = config.title!;
        
        await loggerInstance.info(`Executing blueprint ID: '${currentConfigId}', Title: '${currentTitle}'`);

        // If a commitSha for the blueprint is known, log it.
        // It could come from a local git repo or from a remote fetch.
        if (commitSha) {
            loggerInstance.info(`Using blueprint version from commit: ${commitSha}`);
        }
        
        // If collectionsRepoPath is provided and we don't already have a commitSha from a remote blueprint fetch,
        // try to get it from the local repo.
        if (options.collectionsRepoPath && !commitSha) {
            try {
                const repoPath = path.resolve(options.collectionsRepoPath);
                await fs.access(path.join(repoPath, '.git'));
                commitSha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
                loggerInstance.info(`Retrieved git commit SHA from local collections repo: ${commitSha}`);
            } catch (gitError: any) {
                loggerInstance.warn(`Could not retrieve git commit SHA from ${options.collectionsRepoPath}: ${gitError.message}. This is expected if it's not a git repository.`);
                commitSha = undefined;
            }
        }

        let runLabel = options.runLabel?.trim();
        const contentHash = generateConfigContentHash(config);
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
            loggerInstance.error('The final list of models to evaluate is empty. Halting execution.');
            throw new Error('No models to evaluate after resolving collections.');
        }

        const chosenMethods = parseEvalMethods(options.evalMethod);
        await loggerInstance.info(`Evaluation methods to be used: ${chosenMethods.join(', ')}`);

        await loggerInstance.info('--- Run Blueprint Summary ---');
        await loggerInstance.info(`Blueprint ID: ${currentConfigId}`);
        await loggerInstance.info(`Blueprint Title: ${currentTitle}`);
        await loggerInstance.info(`Run Label: ${finalRunLabel}`);
        await loggerInstance.info(`Evaluation Methods: ${chosenMethods.join(', ')}`);
        await loggerInstance.info(`Models to run: [${config.models.join(', ')}] (Count: ${config.models.length})`);
        await loggerInstance.info('-----------------------------');

        const ora = (await import('ora')).default;
        const mainSpinner = ora('Starting comparison pipeline...').start();
        let newResultData: FetchedComparisonData | null = null;
        let actualResultFileName: string | null = null;

        try {
            mainSpinner.text = `Executing comparison pipeline for blueprint ID: ${currentConfigId}, runLabel: ${finalRunLabel}. Caching: ${options.cache ?? false}`;
            
            const pipelineResult = await executeComparisonPipeline(
                config, 
                finalRunLabel, 
                chosenMethods, 
                loggerInstance, 
                undefined, // existingResponsesMap
                undefined, // forcePointwiseKeyEval
                options.cache,
                commitSha || undefined,
                blueprintFileName
            ); 

            if (pipelineResult && typeof pipelineResult === 'object' && 'fileName' in pipelineResult && 'data' in pipelineResult) {
                newResultData = pipelineResult.data as FetchedComparisonData;
                actualResultFileName = pipelineResult.fileName;
                mainSpinner.succeed(`Comparison pipeline finished successfully! Results may be found at: ${actualResultFileName}`);
            } else {
                throw new Error('executeComparisonPipeline returned an unexpected or null result.');
            }
        } catch (pipelineError: any) {
            mainSpinner.fail(`Comparison pipeline failed: ${pipelineError.message}`);
            if (process.env.DEBUG && pipelineError.stack) {
                loggerInstance.error(`Pipeline stack trace: ${pipelineError.stack}`);
            }
            process.exit(1);
        }

        if (newResultData && (process.env.STORAGE_PROVIDER === 's3' || process.env.UPDATE_LOCAL_SUMMARY === 'true')) {
            loggerInstance.info('Attempting to update summary files...');
            if (!actualResultFileName) {
                throw new Error('Could not determine result filename for summary update.');
            }

            // Update per-config summary
            try {
                loggerInstance.info(`Updating summary for config: ${currentConfigId}`);
                const existingConfigSummary = await getConfigSummary(currentConfigId);
                const existingConfigsArray = existingConfigSummary ? [existingConfigSummary] : null;
                const updatedConfigArray = updateSummaryDataWithNewRun(
                    existingConfigsArray,
                    newResultData,
                    actualResultFileName
                );
                const newConfigSummary = updatedConfigArray[0];
                await saveConfigSummary(currentConfigId, newConfigSummary);
                loggerInstance.info(`Successfully saved per-config summary for ${currentConfigId}.`);
            } catch (configSummaryError: any) {
                loggerInstance.error(`Failed to update per-config summary for ${currentConfigId}: ${configSummaryError.message}`);
            }

            // Update homepage summary
            try {
                loggerInstance.info('Attempting to update homepage summary manifest...');
                const currentFullSummary = await getHomepageSummary();
                const updatedConfigsArrayForHomepage = updateSummaryDataWithNewRun(
                    currentFullSummary?.configs || null,
                    newResultData, 
                    actualResultFileName
                );

                // --- BEGIN: Log Hybrid Score for the New Run ---
                loggerInstance.info('--- Newly Calculated Hybrid Scores ---');
                const newRunConfig = updatedConfigsArrayForHomepage.find(c => c.configId === newResultData.configId);
                if (newRunConfig) {
                    const newRun = newRunConfig.runs.find(r => r.runLabel === newResultData.runLabel && r.timestamp === newResultData.timestamp);
                    if (newRun && newRun.perModelHybridScores) {
                        loggerInstance.info(`Overall Run Hybrid Score Average: ${newRun.hybridScoreStats?.average?.toFixed(4)}`);
                        loggerInstance.info('Per-Model Hybrid Score Averages:');
                        const scoresToLog: Record<string, string> = {};
                        newRun.perModelHybridScores.forEach((stats, modelId) => {
                           scoresToLog[modelId] = stats.average !== null && stats.average !== undefined ? stats.average.toFixed(4) : 'N/A';
                        });
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

                const homepageConfigs = updatedConfigsArrayForHomepage.map(c => {
                    if (c.tags?.includes('_featured')) return c;
                    return { ...c, runs: [] };
                });
                
                // The headline stats should be calculated on all configs, not just featured ones.
                // The calculation functions will internally filter out any configs with the 'test' tag.
                const newHeadlineStats = calculateHeadlineStats(updatedConfigsArrayForHomepage);
                const newDriftDetectionResult = calculatePotentialModelDrift(updatedConfigsArrayForHomepage);

                const newHomepageSummaryContent: HomepageSummaryFileContent = {
                    configs: homepageConfigs,
                    headlineStats: newHeadlineStats,
                    driftDetectionResult: newDriftDetectionResult,
                    lastUpdated: new Date().toISOString(),
                };

                await saveHomepageSummary(newHomepageSummaryContent);
                loggerInstance.info('Homepage summary manifest updated successfully.');

                // Find the full run info object that was just added to the updated homepage summary.
                // This contains the calculated hybrid score s needed for subsequent updates.
                const justAddedRunInfo = updatedConfigsArrayForHomepage
                    .find(c => c.configId === newResultData.configId)?.runs
                    .find(r => r.runLabel === newResultData.runLabel && r.timestamp === newResultData.timestamp);

                // --- BEGIN: Update Latest Runs Summary (after homepage summary is successfully saved) ---
                try {
                    loggerInstance.info('Attempting to update latest runs summary...');
                    
                    if (justAddedRunInfo) {
                        const currentLatestRunsSummary = await getLatestRunsSummary();
                        const newRunSummaryItem: LatestRunSummaryItem = {
                            ...justAddedRunInfo,
                            configId: newResultData.configId,
                            configTitle: newResultData.configTitle
                        };

                        const newRuns = [newRunSummaryItem, ...currentLatestRunsSummary.runs];
                        // De-duplicate based on filename to prevent multiple entries for the same execution
                        const uniqueRuns = Array.from(new Map(newRuns.map(run => [run.fileName, run])).values());
                        
                        const sortedRuns = uniqueRuns.sort((a, b) => new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime());
                        const latest50Runs = sortedRuns.slice(0, 50);

                        await saveLatestRunsSummary({
                            runs: latest50Runs,
                            lastUpdated: new Date().toISOString(),
                        });
                        loggerInstance.info(`Latest runs summary updated successfully. Now contains ${latest50Runs.length} runs.`);
                    } else {
                        loggerInstance.warn('Could not find the new run in the summary data to add it to the latest runs summary. Skipping update.');
                    }
                } catch (latestRunsError: any) {
                    loggerInstance.error(`Failed to update latest runs summary: ${latestRunsError.message}`);
                }
                // --- END: Update Latest Runs Summary ---

                // --- BEGIN: Update Model Summaries (Incremental) ---
                try {
                    if (!justAddedRunInfo) {
                        loggerInstance.warn('Could not find the new run in the summary data, cannot update model summaries. Skipping update.');
                    } else if (!justAddedRunInfo.perModelHybridScores) {
                        loggerInstance.error('Could not find newly calculated hybrid scores on the run data. Aborting model summary update.');
                    } else {
                        loggerInstance.info('Attempting to incrementally update model summaries...');
                        
                        let scoresMap: Map<string, { average: number | null; stddev: number | null }>;
                        if (justAddedRunInfo.perModelHybridScores instanceof Map) {
                            scoresMap = justAddedRunInfo.perModelHybridScores;
                        } else {
                            scoresMap = new Map(Object.entries(justAddedRunInfo.perModelHybridScores));
                        }

                        const modelsInRun = new Set(newResultData.effectiveModels.map(m => parseEffectiveModelId(m).baseId));
                        loggerInstance.info(`Found ${modelsInRun.size} unique base models in this run. Updating their summaries...`);

                        for (const baseModelId of modelsInRun) {
                            // Skip the pseudo-model used for ideal responses
                            if (baseModelId === 'IDEAL_MODEL_ID') {
                                continue;
                            }
                            
                            const existingSummary = await getModelSummary(baseModelId);
                            const newRunsForThisModel: ModelRunPerformance[] = [];

                            // Find all scores for this base model from the calculated scores
                            newResultData.effectiveModels.forEach(effectiveModelId => {
                                if (parseEffectiveModelId(effectiveModelId).baseId === baseModelId) {
                                    const scoreData = scoresMap.get(effectiveModelId);
                                    if (scoreData && scoreData.average !== null && scoreData.average !== undefined) {
                                        newRunsForThisModel.push({
                                            configId: newResultData.configId,
                                            configTitle: newResultData.configTitle,
                                            runLabel: newResultData.runLabel,
                                            timestamp: newResultData.timestamp,
                                            hybridScore: scoreData.average,
                                        });
                                    }
                                }
                            });

                            if (newRunsForThisModel.length === 0) {
                                loggerInstance.warn(`No new performance data found for model ${baseModelId} in this run, skipping its summary update.`);
                                continue;
                            }

                            // Combine with existing runs
                            const allRuns = [...(existingSummary?.runs || [])];
                            newRunsForThisModel.forEach(newRun => {
                                const existingIndex = allRuns.findIndex(r => r.configId === newRun.configId && r.runLabel === newRun.runLabel && r.timestamp === newRun.timestamp);
                                if (existingIndex !== -1) {
                                    allRuns[existingIndex] = newRun;
                                } else {
                                    allRuns.push(newRun);
                                }
                            });
                            
                            // Recalculate all stats
                            const totalRuns = allRuns.length;
                            const blueprintsParticipated = new Set(allRuns.map(r => r.configId));
                            const totalBlueprints = blueprintsParticipated.size;

                            const validScores = allRuns.map(r => r.hybridScore).filter(s => s !== null) as number[];
                            const averageHybridScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null;

                            const blueprintScores = new Map<string, { scores: number[], title: string }>();
                            allRuns.forEach(run => {
                                 if (run.hybridScore !== null) {
                                    const existing = blueprintScores.get(run.configId) || { scores: [], title: run.configTitle };
                                    existing.scores.push(run.hybridScore);
                                    blueprintScores.set(run.configId, existing);
                                }
                            });

                             const avgBlueprintScores = Array.from(blueprintScores.entries()).map(([configId, data]) => ({
                                configId,
                                configTitle: data.title,
                                score: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
                            })).sort((a, b) => b.score - a.score);

                            const updatedModelSummary: ModelSummary = {
                                modelId: baseModelId,
                                displayName: getModelDisplayLabel(baseModelId),
                                provider: baseModelId.split(':')[0] || 'unknown',
                                overallStats: { averageHybridScore, totalRuns, totalBlueprints },
                                strengthsAndWeaknesses: {
                                    topPerforming: avgBlueprintScores.slice(0, 3),
                                    weakestPerforming: avgBlueprintScores.slice(-3).reverse(),
                                },
                                runs: allRuns.sort((a, b) => new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime()),
                                lastUpdated: new Date().toISOString(),
                            };

                            await saveModelSummary(baseModelId, updatedModelSummary);
                        }
                        loggerInstance.info('Finished updating model summaries.');
                    }
                } catch (modelSummaryError: any) {
                    loggerInstance.error(`Failed to update model summaries: ${modelSummaryError.message}`);
                }
                // --- END: Update Model Summaries (Incremental) ---

                // --- BEGIN: Populate Pairwise Task Queue ---
                if (newResultData.config?.tags?.includes('_get_human_prefs')) {
                    try {
                        loggerInstance.info('Found _get_human_prefs tag. Attempting to populate pairwise comparison task queue...');
                        const queueResult = await populatePairwiseQueue(newResultData, { logger: loggerInstance });
                        loggerInstance.info(`Pairwise task queue processed. Added: ${queueResult.tasksAdded}, Total in queue: ${queueResult.totalTasksInQueue}`);
                    } catch (pairwiseError: any) {
                        loggerInstance.error(`Failed to populate pairwise task queue: ${pairwiseError.message}`);
                    }
                }
                // --- END: Populate Pairwise Task Queue ---

            } catch (summaryError: any) {
                loggerInstance.error(`Failed to update homepage summary manifest: ${summaryError.message}`);
            }
        } else {
            loggerInstance.info('Skipping summary file updates.');
        }

        await loggerInstance.info('Weval run_config command finished successfully.');
    } catch (error: any) {
        const logger = getConfig()?.logger || console;
        logger.error(`Top-level error in Weval run command: ${error.message}`);
        if (process.env.DEBUG && error.stack) {
            logger.error(`Overall stack trace: ${error.stack}`);
        }
        try {
            const ora = (await import('ora')).default;
            ora().stop();
        } catch (spinnerError: any) {
            logger.warn(`Could not stop ora spinner on error: ${spinnerError.message}`);
        }
        process.exit(1);
    }
}

async function actionLocal(options: { config?: string } & RunOptions) {
    const { logger: loggerInstance } = getConfig();
    loggerInstance.info(`Weval 'run-config local' CLI started. Options received: ${JSON.stringify(options)}`);
    
    try {
        // Check if config path is missing and prompt for it
        let configPath = options.config;
        if (!configPath) {
            configPath = await promptForConfig();
        }
        
        if (!configPath) {
            throw new Error('Config path is required to proceed.');
        }
        
        const config = await loadAndValidateConfig({ 
            configPath: configPath, 
            collectionsRepoPath: options.collectionsRepoPath,
            isRemote: false,
        });
        await runBlueprint(config, options);
    } catch (error: any) {
        loggerInstance.error(`Error during 'run-config local': ${error.message}`);
        if (process.env.DEBUG && error.stack) {
            loggerInstance.error(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    }
}

async function actionGitHub(options: { name?: string } & RunOptions) {
    const { logger: loggerInstance } = getConfig();
    loggerInstance.info(`Weval 'run-config github' CLI started. Options received: ${JSON.stringify(options)}`);
    
    try {
        // Check if name is missing and prompt for it
        let blueprintName = options.name;
        if (!blueprintName) {
            blueprintName = await promptForBlueprintName();
        }
        
        if (!blueprintName) {
            throw new Error('Blueprint name is required to proceed.');
        }
        
        const githubToken = process.env.GITHUB_TOKEN;
        const remoteConfig = await fetchBlueprintContentByName(blueprintName, githubToken, loggerInstance as SimpleLogger);

        if (!remoteConfig) {
            throw new Error(`Failed to load blueprint '${blueprintName}'. It was not found in the GitHub repository.`);
        }

        const config = await loadAndValidateConfig({
            configContent: remoteConfig.content,
            blueprintPath: remoteConfig.blueprintPath,
            fileType: remoteConfig.fileType,
            collectionsRepoPath: options.collectionsRepoPath,
            isRemote: true,
        });

        await runBlueprint(config, options, remoteConfig.commitSha, remoteConfig.blueprintPath);
    } catch (error: any) {
        // Enhanced error logging
        const chalk = (await import('chalk')).default;
        console.error(chalk.red('\n✖ Critical Error in \'run-config github\':'), chalk.white(error.message));
        if (process.env.DEBUG && error.stack) {
            console.error(chalk.gray('\nStack Trace:'), error.stack);
        } else {
            console.error(chalk.yellow('\nRun with DEBUG=true environment variable for a full stack trace.'));
        }
        process.exit(1);
    }
}


const localCommand = new Command('local')
    .description('Runs an evaluation from a local blueprint file.')
    .option('-c, --config <path>', 'Path to the local blueprint file (.yml, .yaml, or .json). If not provided, you will be prompted to enter it.')
    .option('-r, --run-label <runLabelValue>', 'A unique label for this specific execution run. If not provided, a label will be generated based on the blueprint content.')
    .option('--eval-method <methods>', "Comma-separated evaluation methods (embedding, llm-coverage, all)")
    .option('--cache', 'Enable caching for model responses (defaults to false).')
    .option('--collections-repo-path <path>', 'Path to a local checkout of a collections repository (e.g., weval/configs) to resolve model collection placeholders.')
    .action(actionLocal);

const githubCommand = new Command('github')
    .description('Runs an evaluation from a blueprint on the weval/configs GitHub repository.')
    .option('-n, --name <name>', 'Name of the blueprint in the GitHub repo (e.g., "my-test-blueprint"), without file extension. If not provided, you will be prompted to enter it.')
    .option('-r, --run-label <runLabelValue>', 'A unique label for this specific execution run. If not provided, a label will be generated based on the blueprint content.')
    .option('--eval-method <methods>', "Comma-separated evaluation methods (embedding, llm-coverage, all)")
    .option('--cache', 'Enable caching for model responses (defaults to false).')
    .option('--collections-repo-path <path>', 'Optional. Path to a local checkout of a collections repository to override the default behavior of fetching collections from GitHub.')
    .action(actionGitHub);

export const runConfigCommand = new Command('run-config')
    .description('Runs an evaluation from a local file or a blueprint on GitHub.')
    .addCommand(localCommand)
    .addCommand(githubCommand); 