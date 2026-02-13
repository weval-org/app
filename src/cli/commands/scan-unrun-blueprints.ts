import { Command } from 'commander';
import { getConfig } from '../config';
import axios from 'axios';
import * as yaml from 'js-yaml';
import { generateConfigContentHash } from '@/lib/hash-utils';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { BLUEPRINT_CONFIG_REPO_SLUG } from '@/lib/configConstants';
import { executeComparisonPipeline } from '../services/comparison-pipeline-service';
import { EvaluationMethod } from '../types/cli_types';
import { normalizeTag } from '@/app/utils/tagUtils';
import { CustomModelDefinition } from '@/lib/llm-clients/types';
import { registerCustomModels } from '@/lib/llm-clients/client-dispatcher';
import { generateBlueprintIdFromPath } from '@/app/utils/blueprintIdUtils';

type Logger = ReturnType<typeof getConfig>['logger'];

let _s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: process.env.APP_S3_REGION!,
      credentials: {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3Client;
}

interface BlueprintInfo {
  path: string;
  configId: string;
  contentHash: string;
  hasRun: boolean;
  url: string;
}

/**
 * Fetch all blueprint files from GitHub
 */
async function fetchAllBlueprints(
  githubToken?: string,
  logger?: Logger
): Promise<Array<{ path: string; url: string }>> {
  const apiHeaders: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };

  if (githubToken) {
    apiHeaders['Authorization'] = `token ${githubToken}`;
  }

  const treeApiUrl = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/git/trees/main?recursive=1`;
  logger?.info(`Fetching blueprint tree from GitHub...`);

  try {
    const treeResponse = await axios.get(treeApiUrl, { headers: apiHeaders });
    const blueprintFiles = treeResponse.data.tree
      .filter((node: any) =>
        node.type === 'blob' &&
        node.path.startsWith('blueprints/') &&
        !node.path.startsWith('blueprints/pr-evals/') && // Skip PR staging
        (node.path.endsWith('.yml') || node.path.endsWith('.yaml'))
      )
      .map((node: any) => ({
        path: node.path,
        url: node.url,
      }));

    logger?.info(`Found ${blueprintFiles.length} blueprint files in repository`);
    return blueprintFiles;
  } catch (error: any) {
    logger?.error(`Failed to fetch blueprints: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch blueprint content from GitHub
 */
async function fetchBlueprintContent(
  url: string,
  githubToken?: string
): Promise<string | null> {
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3.raw' };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  try {
    const response = await axios.get(url, { headers });
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  } catch (error: any) {
    console.error(`Failed to fetch content from ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Check if blueprint has been evaluated
 */
async function hasBeenEvaluated(configId: string, contentHash: string): Promise<boolean> {
  try {
    const resultKey = `live/blueprints/${configId}/${contentHash}_comparison.json`;

    await getS3Client().send(new HeadObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: resultKey,
    }));

    return true; // File exists
  } catch (error: any) {
    if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
      return false; // File doesn't exist
    }
    throw error;
  }
}

/**
 * Scan all blueprints and check which ones haven't been run
 */
async function scanUnrunBlueprints(
  githubToken?: string,
  logger?: Logger
): Promise<BlueprintInfo[]> {
  const allBlueprints = await fetchAllBlueprints(githubToken, logger);
  const blueprintInfos: BlueprintInfo[] = [];

  logger?.info(`Analyzing ${allBlueprints.length} blueprints...`);

  let processedCount = 0;
  const progressInterval = setInterval(() => {
    logger?.info(`Progress: ${processedCount}/${allBlueprints.length} blueprints analyzed...`);
  }, 5000);

  for (const blueprint of allBlueprints) {
    try {
      // Fetch content
      const content = await fetchBlueprintContent(blueprint.url, githubToken);
      if (!content) {
        logger?.warn(`Skipping ${blueprint.path}: Failed to fetch content`);
        processedCount++;
        continue;
      }

      // Parse blueprint
      let config;
      try {
        config = parseAndNormalizeBlueprint(content, 'yaml');
      } catch (error: any) {
        logger?.warn(`Skipping ${blueprint.path}: Parse error - ${error.message}`);
        processedCount++;
        continue;
      }

      // Always derive id from filepath (YAML id field is deprecated per run-config)
      const relPath = blueprint.path.replace(/^blueprints\//, '');
      config.id = generateBlueprintIdFromPath(relPath);

      // Calculate content hash
      const modelIds = config.models?.map((m: any) => typeof m === 'string' ? m : m.id) || [];
      const contentHash = generateConfigContentHash({ ...config, models: modelIds });

      // Check if evaluated
      const hasRun = await hasBeenEvaluated(config.id, contentHash);

      blueprintInfos.push({
        path: blueprint.path,
        configId: config.id,
        contentHash,
        hasRun,
        url: blueprint.url,
      });

      processedCount++;
    } catch (error: any) {
      logger?.error(`Error processing ${blueprint.path}: ${error.message}`);
      processedCount++;
    }
  }

  clearInterval(progressInterval);
  logger?.info(`✓ Analyzed all ${allBlueprints.length} blueprints`);

  return blueprintInfos;
}

/**
 * Run evaluation for a single blueprint
 */
async function runBlueprintEvaluation(
  blueprintInfo: BlueprintInfo,
  content: string,
  githubToken: string | undefined,
  logger: Logger
): Promise<boolean> {
  try {
    logger.info(`\n▶ Running evaluation for ${blueprintInfo.path}...`);

    const config = parseAndNormalizeBlueprint(content, 'yaml');

    // Register custom models
    const customModelDefs = config.models?.filter((m: any) => typeof m === 'object') as CustomModelDefinition[] || [];
    if (customModelDefs.length > 0) {
      registerCustomModels(customModelDefs);
      logger.info(`  Registered ${customModelDefs.length} custom model definitions`);
    }

    // Sanitize system prompts
    if (Array.isArray(config.system)) {
      if (config.systems && config.systems.length > 0) {
        logger.warn(`  Both 'system' and 'systems' defined. Using 'systems'.`);
      } else {
        config.systems = config.system;
      }
      config.system = undefined;
    }

    // Normalize tags
    if (config.tags) {
      const originalTags = [...config.tags];
      const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
      config.tags = normalizedTags;
    }

    // Add scan tag
    config.tags = config.tags || [];
    config.tags.push('_scan_unrun');

    const modelIds = config.models?.map((m: any) => typeof m === 'string' ? m : m.id) || [];
    const runLabel = blueprintInfo.contentHash;
    const evalMethods: EvaluationMethod[] = ['embedding', 'llm-coverage'];

    logger.info(`  Models: ${modelIds.length}, Prompts: ${config.prompts?.length || 0}`);

    await executeComparisonPipeline(
      { ...config, models: modelIds },
      runLabel,
      evalMethods,
      logger,
      undefined, // outputDir
      undefined, // fileNameOverride
      true, // useCache
      undefined // commitSha
    );

    logger.success(`✓ Successfully completed evaluation for ${blueprintInfo.path}`);
    return true;
  } catch (error: any) {
    logger.error(`✗ Failed to evaluate ${blueprintInfo.path}: ${error.message}`);
    return false;
  }
}

/**
 * Command: scan-unrun-blueprints
 */
export const scanUnrunBlueprintsCommand = new Command('scan-unrun-blueprints')
  .description('Scan all blueprints in the repository and identify which ones have not been evaluated')
  .option('--run', 'Actually run evaluations for unrun blueprints (default: just list them)')
  .option('--limit <number>', 'Maximum number of blueprints to run (default: no limit)', parseInt)
  .option('--github-token <token>', 'GitHub token for API access (defaults to GITHUB_TOKEN env var)')
  .action(async (options) => {
    const config = getConfig();
    const logger = config.logger;

    const githubToken = options.githubToken || process.env.GITHUB_TOKEN;

    if (!githubToken) {
      logger.warn('No GitHub token provided. API rate limits will be strict.');
    }

    try {
      // Scan all blueprints
      logger.info('🔍 Scanning blueprints repository...\n');
      const blueprints = await scanUnrunBlueprints(githubToken, logger);

      // Separate run and unrun
      const runBlueprints = blueprints.filter(b => b.hasRun);
      const unrunBlueprints = blueprints.filter(b => !b.hasRun);

      // Display results
      logger.info(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`📊 SCAN RESULTS`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`Total blueprints: ${blueprints.length}`);
      logger.success(`✓ Already evaluated: ${runBlueprints.length}`);
      logger.warn(`⚠ Not yet evaluated: ${unrunBlueprints.length}`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      if (unrunBlueprints.length === 0) {
        logger.success('🎉 All blueprints have been evaluated!');
        return;
      }

      // List unrun blueprints
      logger.info('📝 Unrun blueprints:\n');
      for (const blueprint of unrunBlueprints) {
        logger.info(`  • ${blueprint.path} (${blueprint.configId})`);
        logger.info(`    Hash: ${blueprint.contentHash}`);
      }

      // Run evaluations if --run flag is set
      if (options.run) {
        const limit = options.limit || unrunBlueprints.length;
        const toRun = unrunBlueprints.slice(0, limit);

        logger.info(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        logger.info(`🚀 RUNNING EVALUATIONS`);
        logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        logger.info(`Running ${toRun.length} of ${unrunBlueprints.length} unrun blueprints\n`);

        const results = {
          success: 0,
          failed: 0,
          errors: [] as string[],
        };

        for (let i = 0; i < toRun.length; i++) {
          const blueprint = toRun[i];
          logger.info(`[${i + 1}/${toRun.length}] ${blueprint.path}`);

          // Fetch content
          const content = await fetchBlueprintContent(blueprint.url, githubToken);
          if (!content) {
            logger.error(`Failed to fetch content for ${blueprint.path}`);
            results.failed++;
            results.errors.push(`${blueprint.path}: Failed to fetch content`);
            continue;
          }

          // Run evaluation
          const success = await runBlueprintEvaluation(blueprint, content, githubToken, logger);

          if (success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push(`${blueprint.path}: Evaluation failed`);
          }
        }

        // Summary
        logger.info(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        logger.info(`📊 EVALUATION SUMMARY`);
        logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        logger.success(`✓ Successful: ${results.success}`);
        logger.error(`✗ Failed: ${results.failed}`);
        logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        if (results.errors.length > 0) {
          logger.info('Errors:\n');
          for (const error of results.errors) {
            logger.error(`  • ${error}`);
          }
        }
      } else {
        logger.info(`\n💡 To run evaluations for these blueprints, use:`);
        logger.info(`   pnpm cli scan-unrun-blueprints --run\n`);

        if (unrunBlueprints.length > 10) {
          logger.info(`💡 To run a limited number, use:`);
          logger.info(`   pnpm cli scan-unrun-blueprints --run --limit 5\n`);
        }
      }
    } catch (error: any) {
      config.errorHandler?.(error);
    }
  });
