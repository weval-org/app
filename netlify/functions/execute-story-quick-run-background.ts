import type { BackgroundHandler } from '@netlify/functions';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { executeComparisonPipeline } from '@/cli/services/comparison-pipeline-service';
import { ComparisonConfig, EvaluationMethod, FinalComparisonOutputV2 } from '@/cli/types/cli_types';
import { toSafeTimestamp } from '@/lib/timestampUtils';
import { cleanupTmpCache } from '@/lib/cache-service';
import { initSentry, captureError, setContext, flushSentry } from '@/utils/sentry';
import { checkBackgroundFunctionAuth } from '@/lib/background-function-auth';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const STORY_RUNS_DIR = 'live/story/runs';

const DEFAULT_MODELS = [
  'openrouter:anthropic/claude-3-haiku',
  'openrouter:openai/gpt-5-nano',
  'openrouter:mistralai/mistral-nemo'
];

const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

const getStatusUpdater = (runId: string, logger: Awaited<ReturnType<typeof getLogger>>) => {
  return async (status: string, message: string, extraData: object = {}) => {
    logger.info(`Updating status: ${status} - ${message}`, extraData);
    const statusKey = `${STORY_RUNS_DIR}/${runId}/status.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: statusKey,
      Body: JSON.stringify({ status, message, ...extraData, timestamp: new Date().toISOString() }),
      ContentType: 'application/json',
    }));
  };
};

function compactify(run: FinalComparisonOutputV2) {
  const prompts: any[] = [];
  for (const p of run.config.prompts || []) {
    const modelResponses: any = {};
    const scores: any = {};
    const assessments: any = {}; // NEW: Store point assessments per model
    const allFinal = run.allFinalAssistantResponses || {};
    const ideal = allFinal[p.id]?.['ideal'];

    for (const modelId of run.effectiveModels) {
      if (modelId === 'ideal') continue;
      modelResponses[modelId] = allFinal[p.id]?.[modelId] || null;
      const coverage = run.evaluationResults.llmCoverageScores?.[p.id]?.[modelId] || null;
      // Use avgCoverageExtent when available; default to 0
      scores[modelId] = (coverage && typeof coverage === 'object' && 'avgCoverageExtent' in coverage
        ? (coverage as any).avgCoverageExtent
        : 0) || 0;
      
      // NEW: Include point assessments with judge reasoning
      if (coverage && typeof coverage === 'object' && 'pointAssessments' in coverage) {
        assessments[modelId] = (coverage as any).pointAssessments || [];
      }
    }
    prompts.push({
      id: p.id,
      prompt: p.promptText,
      points: p.points,
      ideal,
      modelResponses,
      scores,
      assessments, // NEW: Include detailed assessments
    });
  }
  return { prompts, models: run.effectiveModels.filter(m => m !== 'ideal') };
}


export const handler: BackgroundHandler = async (event) => {
  // Initialize Sentry for this function
  initSentry('execute-story-quick-run-background');

  // Check authentication
  const authError = checkBackgroundFunctionAuth(event);
  if (authError) {
    await flushSentry();
    return authError;
  }

  const body = event.body ? JSON.parse(event.body) : {};
  const { runId, blueprintKey } = body;

  // Set Sentry context for this invocation
  setContext('quickRun', {
    runId,
    blueprintKey,
    netlifyContext: event.headers?.['x-nf-request-id'],
  });

  const logger = await getLogger(`story:quick-run:bg:${runId}`);
  configure({
    logger: {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      error: (m) => logger.error(m),
      success: (m) => logger.info(m),
    },
    errorHandler: (err) => {
      logger.error(`error: ${err?.message || err}`, err);
      if (err instanceof Error) {
        captureError(err, { runId, blueprintKey });
      }
    },
  });

  const updateStatus = getStatusUpdater(runId, logger);

  if (!runId || !blueprintKey) {
    const errorMsg = 'Missing runId or blueprintKey in invocation';
    logger.error(errorMsg, { runId, blueprintKey, body });
    captureError(new Error(errorMsg), { runId, blueprintKey, body });
    await flushSentry();
    return;
  }

  // Clean up /tmp cache at start to prevent disk space issues
  cleanupTmpCache(100); // Keep cache under 100MB

  try {
    await updateStatus('pending', 'Fetching test plan...');

    const blueprintContent = await streamToString(
      (await s3Client.send(new GetObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: blueprintKey,
      }))).Body as Readable
    );
    const outline = JSON.parse(blueprintContent);

    const limitedPrompts = (outline.prompts || []).slice(0, 5).map((p: any, idx: number) => ({
      id: p.id || `p_${idx + 1}`,
      promptText: p.promptText || '',
      messages: Array.isArray(p.messages) && p.messages.length > 0
        ? p.messages
        : [{ role: 'user', content: p.promptText || '' }],
      idealResponse: p.idealResponse,
      points: p.points,
    }));

    const config: ComparisonConfig = {
      id: outline.id || `story-quickrun-${runId}`,
      title: outline.title || 'Story Quick Test',
      description: outline.description || undefined,
      // Intentionally ignore any models specified in the outline for quick runs.
      // We want a consistent default cohort here.
      models: DEFAULT_MODELS,
      prompts: limitedPrompts,
      evaluationConfig: {
        'llm-coverage': {
          judges: [{ id: 'holistic-gemini-flash', model: 'openrouter:google/gemini-2.5-flash', approach: 'holistic' }],
        } as any,
      },
      temperature: 0,
    } as any;

    await updateStatus('generating_responses', 'Generating model responses...');

    // NOTE: The streaming callback from the pipeline is not yet implemented for background functions.
    // We will update status before and after major steps.

    const { data: finalOutput } = await executeComparisonPipeline(
      config,
      'story-quickrun',
      ['llm-coverage'],
      logger as any,
      undefined, // existingResponsesMap
      undefined, // forcePointwiseKeyEval
      true,      // useCache
      undefined, // commitSha
      undefined, // blueprintFileName
      undefined, // requireExecutiveSummary
      true,      // skipExecutiveSummary
      { genTimeoutMs: 25000, genRetries: 0 }, // genOptions
      undefined, // prefilledCoverage
      undefined, // fixturesCtx
      true,      // noSave
    );

    await updateStatus('evaluating', 'Scoring responses...'); // Simplified status for now

    const compactResult = compactify(finalOutput);

    const resultKey = `${STORY_RUNS_DIR}/${runId}/result.json`;
    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: resultKey,
        Body: JSON.stringify(compactResult),
        ContentType: 'application/json',
    }));

    await updateStatus('complete', 'Run finished!', { result: compactResult });

    logger.info('Story quick run completed successfully');
    await flushSentry();

  } catch (error: any) {
    const errorContext = {
      runId,
      blueprintKey,
      message: error.message,
      stack: error.stack,
      name: error.name,
    };

    logger.error(`Pipeline failed for runId ${runId}`, error);
    captureError(error, errorContext);

    await updateStatus('error', 'An error occurred during the evaluation.', {
      details: error.message,
      errorType: error.name,
    });

    // Ensure Sentry events are sent before function exits
    await flushSentry();
  }
};
