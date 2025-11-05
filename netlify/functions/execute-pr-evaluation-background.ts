import type { BackgroundHandler } from '@netlify/functions';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getAuthenticatedOctokit, logAuthConfig } from '@/lib/github-auth';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { generateAllResponses } from '@/cli/services/comparison-pipeline-service.non-stream';
import { EmbeddingEvaluator } from '@/cli/evaluators/embedding-evaluator';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import { ComparisonConfig, FinalComparisonOutputV2, EvaluationMethod, PromptResponseData, EvaluationInput } from '@/cli/types/cli_types';
import { normalizeTag } from '@/app/utils/tagUtils';
import { configure } from '@/cli/config';
import { CustomModelDefinition } from '@/lib/llm-clients/types';
import { registerCustomModels } from '@/lib/llm-clients/client-dispatcher';
import { cleanupTmpCache } from '@/lib/cache-service';
import { getLogger, Logger } from '@/utils/logger';
import { initSentry, captureError, setContext, flushSentry } from '@/utils/sentry';
import { checkBackgroundFunctionAuth } from '@/lib/background-function-auth';
import { applyPREvalLimits, checkPREvalLimits } from '@/lib/pr-eval-limiter';

const UPSTREAM_OWNER = 'weval-org';
const UPSTREAM_REPO = 'configs';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

/**
 * Generate storage path for PR evaluation
 */
function getPRStoragePath(prNumber: number, blueprintPath: string): string {
  // Sanitize blueprint path to create a safe directory name
  // blueprints/users/alice/my-blueprint.yml -> alice-my-blueprint
  const sanitized = blueprintPath
    .replace(/^blueprints\/users\//, '')
    .replace(/\.ya?ml$/, '')
    .replace(/\//g, '-');

  return `live/pr-evals/${prNumber}/${sanitized}`;
}

/**
 * Status updater for PR evaluations
 */
const getStatusUpdater = (basePath: string, runId: string, logger: Logger) => {
  return async (status: string, message: string, extraData: object = {}) => {
    logger.info(`Updating status for ${runId}: ${status} - ${message}`, extraData);
    const statusKey = `${basePath}/status.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: statusKey,
      Body: JSON.stringify({ status, message, updatedAt: new Date().toISOString(), ...extraData }),
      ContentType: 'application/json',
    }));
  };
};

/**
 * Post completion comment to PR
 */
async function postCompletionComment(
  prNumber: number,
  blueprintPath: string,
  success: boolean,
  basePath: string,
  configId?: string,
  error?: string
): Promise<void> {
  try {
    const octokit = await getAuthenticatedOctokit();
    logAuthConfig();
  const resultsUrl = `https://weval.org/pr-eval/${prNumber}/${encodeURIComponent(blueprintPath)}`;
  const analysisUrl = configId ? `https://weval.org/analysis/${configId}` : null;

  let commentBody: string;

  if (success) {
    commentBody =
      `✅ **Evaluation complete for \`${blueprintPath}\`**\n\n` +
      `[View evaluation status →](${resultsUrl})` +
      (analysisUrl ? ` | [**View full analysis →**](${analysisUrl})` : '') +
      `\n\n` +
      `The blueprint has been successfully evaluated against all configured models.`;
  } else {
    commentBody =
      `❌ **Evaluation failed for \`${blueprintPath}\`**\n\n` +
      `[View status →](${resultsUrl})\n\n` +
      `Error: ${error || 'Unknown error'}\n\n` +
      `Please check the blueprint syntax and try again.`;
  }

    await octokit.issues.createComment({
      owner: UPSTREAM_OWNER,
      repo: UPSTREAM_REPO,
      issue_number: prNumber,
      body: commentBody,
    });
    console.log(`[PR Eval] Posted completion comment to PR #${prNumber}`);
  } catch (err: any) {
    console.error(`[PR Eval] Failed to post completion comment:`, err.message);
  }
}

export const handler: BackgroundHandler = async (event) => {
  // Initialize Sentry
  initSentry('execute-pr-evaluation-background');

  // Check authentication
  const authError = checkBackgroundFunctionAuth(event);
  if (authError) {
    console.error('[PR Eval] Authentication failed:', authError);
    await flushSentry();
    return;
  }

  const body = event.body ? JSON.parse(event.body) : {};
  const { runId, prNumber, blueprintPath, blueprintContent, commitSha, author } = body;

  // Set Sentry context
  setContext('prEvaluation', {
    runId,
    prNumber,
    blueprintPath,
    commitSha,
    author,
    netlifyContext: event.headers?.['x-nf-request-id'],
  });

  const logger = await getLogger(`pr-eval:${prNumber}:${runId}`);

  // Configure CLI
  configure({
    errorHandler: (error: Error) => {
      logger.error(`CLI Error: ${error.message}`, error);
      if (error instanceof Error) {
        captureError(error, { runId, prNumber, blueprintPath });
      }
    },
    logger: {
      info: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      success: (msg: string) => logger.info(msg),
    }
  });

  logger.info(`CLI configured for PR #${prNumber} evaluation`);

  if (!runId || !prNumber || !blueprintPath || !blueprintContent) {
    const errorMsg = 'Missing required parameters';
    logger.error(errorMsg, { runId, prNumber, blueprintPath });
    captureError(new Error(errorMsg), { runId, prNumber, blueprintPath, body });
    await flushSentry();
    return;
  }

  // Clean up /tmp cache
  cleanupTmpCache(100);

  // Determine storage path
  const basePath = getPRStoragePath(prNumber, blueprintPath);
  const updateStatus = getStatusUpdater(basePath, runId, logger);

  try {
    // Save blueprint to S3
    await updateStatus('pending', 'Saving blueprint...');
    const blueprintKey = `${basePath}/blueprint.yml`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: blueprintKey,
      Body: blueprintContent,
      ContentType: 'application/x-yaml',
    }));

    // Save PR metadata
    const metadataKey = `${basePath}/pr-metadata.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: metadataKey,
      Body: JSON.stringify({
        prNumber,
        blueprintPath,
        commitSha,
        author,
        runId,
        startedAt: new Date().toISOString(),
      }),
      ContentType: 'application/json',
    }));

    // Parse blueprint
    await updateStatus('validating', 'Validating blueprint structure...');
    let config = parseAndNormalizeBlueprint(blueprintContent, 'yaml');

    // Apply PR evaluation limits (trim if needed)
    const githubToken = process.env.GITHUB_TOKEN;
    const limitCheck = await checkPREvalLimits(config, githubToken);

    if (!limitCheck.allowed) {
      logger.info(`Blueprint exceeds PR limits. Applying limits...`);
      logger.info(`Original: ${config.prompts?.length || 0} prompts, ${config.models?.length || 0} models`);

      config = await applyPREvalLimits(config, githubToken);

      logger.info(`After limits: ${config.prompts?.length || 0} prompts, ${config.models?.length || 0} models`);
      await updateStatus('validating', `Blueprint trimmed to fit PR evaluation limits (${config.prompts?.length || 0} prompts, ${config.models?.length || 0} models)`);
    }

    // Register custom models
    const customModelDefs = config.models?.filter(m => typeof m === 'object') as CustomModelDefinition[] || [];
    if (customModelDefs.length > 0) {
      registerCustomModels(customModelDefs);
      logger.info(`Registered ${customModelDefs.length} custom model definitions.`);
    }

    // Sanitize system prompts
    if (Array.isArray(config.system)) {
      if (config.systems && config.systems.length > 0) {
        logger.warn(`Both 'system' (as an array) and 'systems' are defined. Using 'systems'.`);
      } else {
        logger.info(`Found 'system' field is an array. Treating it as 'systems' array.`);
        config.systems = config.system;
      }
      config.system = undefined;
    }

    // Normalize tags
    if (config.tags) {
      const originalTags = [...config.tags];
      const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
      config.tags = normalizedTags;
      if (originalTags.length !== normalizedTags.length) {
        logger.info(`Normalized tags from ${originalTags.length} to ${normalizedTags.length}.`);
      }
    }

    // Add PR-specific tags
    config.tags = config.tags || [];
    config.tags.push('_pr_evaluation');
    config.tags.push(`_pr_${prNumber}`);
    config.tags.push(`_author_${author}`);

    logger.info(`Starting evaluation for blueprint: ${config.id || 'unnamed'}`);
    logger.info(`Models: ${config.models?.length || 0}, Prompts: ${config.prompts?.length || 0}`);

    // Generate responses
    await updateStatus('generating_responses', 'Generating model responses...', { progress: { completed: 0, total: 0 } });

    const progressCallback = async (completed: number, total: number): Promise<void> => {
      try {
        await updateStatus('generating_responses', `Generating responses... (${completed}/${total})`, {
          progress: { completed, total }
        });
      } catch (err) {
        logger.error('Failed to update progress:', err);
      }
    };

    const responsesMap = await generateAllResponses(
      config,
      logger,
      false, // useCache = false for PR evals
      progressCallback
    );

    const modelIds = Array.from(new Set(
      Array.from(responsesMap.values()).flatMap(data =>
        Object.keys(data.modelResponses)
      )
    ));

    logger.info(`Generated ${responsesMap.size} responses across ${modelIds.length} models.`);

    // Run evaluators (simplified for PR evals - just use LLM coverage)
    await updateStatus('evaluating', 'Running evaluations...');

    const evaluationResults: Record<string, any> = {};

    // Build evaluation inputs for all prompts
    const evalInputs: EvaluationInput[] = Array.from(responsesMap.values()).map(promptData => ({
      promptData,
      config,
      effectiveModelIds: modelIds,
    }));

    // Run LLM coverage evaluator
    const llmEvaluator = new LLMCoverageEvaluator(logger, false);
    const llmCoverageResults = await llmEvaluator.evaluate(evalInputs);

    evaluationResults['llm-coverage'] = llmCoverageResults;

    // Build final output
    await updateStatus('saving', 'Aggregating and saving results...');

    const finalOutput = {
      configId: config.id || 'unknown',
      configTitle: config.title || config.id || 'Untitled',
      description: config.description,
      tags: config.tags,
      config: config,
      prompts: config.prompts || [],
      models: modelIds,
      executiveSummary: undefined, // Skip for PR evals
      evaluationResults: {
        embedding: evaluationResults.embedding,
        'llm-coverage': evaluationResults['llm-coverage'],
      },
      // Include response data from the map
      allFinalAssistantResponses: Array.from(responsesMap.entries()).reduce((acc, [key, data]) => {
        if (!acc[data.promptId]) acc[data.promptId] = {};
        Object.keys(data.modelResponses).forEach(modelId => {
          acc[data.promptId][modelId] = data.modelResponses[modelId].finalAssistantResponseText;
        });
        return acc;
      }, {} as Record<string, Record<string, string>>),
    };

    // Save results
    const resultKey = `${basePath}/_comparison.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: resultKey,
      Body: JSON.stringify(finalOutput, null, 2),
      ContentType: 'application/json',
    }));

    logger.info(`Results saved to: ${resultKey}`);

    // Update final status
    await updateStatus('complete', 'Evaluation complete!', {
      completedAt: new Date().toISOString(),
      resultUrl: `https://weval.org/pr-eval/${prNumber}/${encodeURIComponent(blueprintPath)}`,
    });

    // Post success comment to PR
    await postCompletionComment(prNumber, blueprintPath, true, basePath, config.id);

    logger.info(`✅ PR evaluation complete for ${blueprintPath}`);
    await flushSentry();

  } catch (error: any) {
    logger.error(`❌ PR evaluation failed:`, error);
    captureError(error, { runId, prNumber, blueprintPath });

    try {
      await updateStatus('error', `Evaluation failed: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        failedAt: new Date().toISOString(),
      });

      // Post failure comment to PR
      await postCompletionComment(prNumber, blueprintPath, false, basePath, error.message);
    } catch (statusError: any) {
      logger.error('Failed to update error status:', statusError);
    }

    await flushSentry();
  }
};
