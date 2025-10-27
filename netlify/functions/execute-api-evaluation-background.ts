import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import path from 'path';
import { executeComparisonPipeline } from "../../src/cli/services/comparison-pipeline-service";
import { generateConfigContentHash } from "../../src/lib/hash-utils";
import { CustomModelDefinition } from '../../src/lib/llm-clients/types';
import { registerCustomModels } from '../../src/lib/llm-clients/client-dispatcher';
import { trackStatus } from '../../src/lib/status-tracker';
import { configure } from '../../src/cli/config';
import { ComparisonConfig, EvaluationMethod } from '../../src/cli/types/cli_types';
import { cleanupTmpCache } from '../../src/lib/cache-service';
import { getLogger } from "../../src/utils/logger";
import { initSentry, captureError, setContext, flushSentry } from "../../src/utils/sentry";
import { checkBackgroundFunctionAuth } from "../../src/lib/background-function-auth";

const STORAGE_PREFIX = 'api-runs';

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Initialize Sentry for this function
  initSentry('execute-api-evaluation-background');

  // Check authentication
  const authError = checkBackgroundFunctionAuth(event);
  if (authError) {
    await flushSentry();
    return authError;
  }

  // Clean up /tmp cache at start to prevent disk space issues
  cleanupTmpCache(100); // Keep cache under 100MB

  let requestPayload: { runId: string; config: ComparisonConfig } | null = null;

  try {
    requestPayload = JSON.parse(event.body || '{}');
  } catch (e: any) {
    const error = e instanceof Error ? e : new Error(String(e));
    captureError(error, { parseError: e.message });
    await flushSentry();
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON in request body.", details: e.message }),
    };
  }

  const { runId, config } = requestPayload as { runId: string; config: ComparisonConfig };

  // Set Sentry context for this invocation
  setContext('apiEval', {
    runId,
    configId: config?.id,
    netlifyContext: event.headers?.['x-nf-request-id'],
  });

  const logger = await getLogger(`api-eval:bg:${runId}`);

  if (!runId || !config || typeof config !== 'object') {
    logger.error("Invalid or missing 'runId' or 'config' in payload.", { payloadReceived: requestPayload });
    captureError(new Error("Invalid or missing 'runId' or 'config' in payload"), { payloadReceived: requestPayload });
    await flushSentry();
    return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid or missing 'runId' or 'config' in payload." }),
    };
  }

  const statusTracker = trackStatus(STORAGE_PREFIX, runId, logger as any);

  // Initialize CLI config so LLM clients (embeddings/generation) and logger are wired in serverless
  try {
    configure({
      errorHandler: (err: Error) => {
        logger.error(`error: ${err?.message || err}`, err);
        if (err instanceof Error) {
          captureError(err, { runId, configId: config?.id });
        }
      },
      logger: {
        info: (msg: string) => logger.info(msg),
        warn: (msg: string) => logger.warn(msg),
        error: (msg: string) => logger.error(msg),
        success: (msg: string) => logger.info(msg),
      },
    });
  } catch {}

  try {
    logger.info(`Starting API evaluation for runId: ${runId}`);
    await statusTracker.running();
    await statusTracker.saveBlueprint(config);

    // The sandbox flow has a explicit 'id' field in the payload that it uses for the configId.
    // For the API, the blueprint might not have one, so we derive it or use a placeholder.
    // For now, let's use a portion of the runId as the configId for storage path purposes.
    // This detail is important because storage paths are like `live/blueprints/{configId}/{runFile}`
    // A stable but unique-per-run configId is acceptable here as these are isolated runs.
    const configIdForStorage = `api-run-${runId.split('-')[0]}`;
    config.id = configIdForStorage; // Assign it to the config for the pipeline

    // Normalize prompts: synthesize messages[] when only prompt/promptText is provided
    try {
      if (Array.isArray(config?.prompts)) {
        config.prompts = config.prompts.map((p: any) => {
          if (!p) return p;
          // Prefer existing messages
          if (!Array.isArray(p.messages) || p.messages.length === 0) {
            const text = typeof p.prompt === 'string' ? p.prompt : (typeof p.promptText === 'string' ? p.promptText : undefined);
            if (typeof text === 'string' && text.trim().length > 0) {
              p.messages = [{ role: 'user', content: text }];
            }
          }
          return p;
        });
      }
    } catch (normErr: any) {
      logger.warn?.(`Prompt normalization failed: ${normErr?.message || normErr}`);
    }

    // Generate runLabel from content hash to ensure idempotency if the same config is submitted
    const contentHash = generateConfigContentHash(config);
    const runLabel = contentHash;

    logger.info(`Executing pipeline for runId: ${runId} with derived configId: ${configIdForStorage} and runLabel: ${runLabel}`);

    // --- Custom Model Registration ---
    const customModelDefs = config.models.filter(m => typeof m === 'object') as CustomModelDefinition[];
    if (customModelDefs.length > 0) {
        registerCustomModels(customModelDefs);
        logger.info(`Registered ${customModelDefs.length} custom model definitions.`);
    }
    const modelIdsToRun = config.models.map(m => (typeof m === 'string' ? m : m.id));
    // --- End Custom Model Registration ---

    const skipSummary = (config as any).skipExecutiveSummary === true;
    const evalMethods = (config as any)._weval_api_defaults_applied
      ? ['llm-coverage']
      : ['embedding', 'llm-coverage'];

    if ((config as any)._weval_api_defaults_applied) {
      logger.info('API defaults applied: forcing llm-coverage and skipping executive summary.');
    }

    const { fileName } = await executeComparisonPipeline(
      { ...config, models: modelIdsToRun },
      runLabel,
      evalMethods as EvaluationMethod[],
      logger,
      undefined, // existingResponsesMap
      undefined, // forcePointwiseKeyEval
      true, // useCache
      undefined, // commitSha
      undefined, // blueprintFileName
      false, // requireExecutiveSummary
      skipSummary, // skipExecutiveSummary
    );

    if (fileName) {
        logger.success(`Pipeline for runId: ${runId} completed. Output file: ${fileName}`);
        
        // The full analysis path needs the timestamp, which is part of the filename.
        // Filename format: {timestamp}_{contentHash}_comparison.json
        const timestamp = path.basename(fileName).split('_')[1];
        const resultUrl = `${process.env.NEXT_PUBLIC_APP_URL}/analysis/${configIdForStorage}/${runLabel}/${timestamp}`;
        
        await statusTracker.completed({
            message: "Evaluation completed successfully.",
            // Save the real persisted key so result readers can fetch directly
            output: `live/blueprints/${configIdForStorage}/${fileName}`,
            resultUrl: resultUrl,
        });

        logger.info('API evaluation completed successfully');
        await flushSentry();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "API evaluation pipeline finished.", runId, output: fileName, resultUrl }),
        };
    } else {
        throw new Error("Pipeline execution did not return a valid output key.");
    }
  } catch (error: any) {
    const errorContext = {
      runId,
      configId: config?.id,
      message: error.message,
      stack: error.stack,
      name: error.name,
    };

    logger.error(`Unhandled error during pipeline execution for runId: ${runId}`, error);
    captureError(error, errorContext);

    await statusTracker.failed({
        error: "An unexpected error occurred during the evaluation pipeline.",
        details: error.message,
    });

    // Ensure Sentry events are sent before function exits
    await flushSentry();

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Unhandled error during pipeline execution.",
        details: error.message,
        runId: runId
      }),
    };
  }
};
