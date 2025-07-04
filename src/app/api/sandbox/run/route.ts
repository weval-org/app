import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import * as yaml from 'js-yaml';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ComparisonConfig, PromptConfig, LLMCoverageEvaluationConfig } from '@/cli/types/cli_types';

// --- Zod Validation Schema for incoming data ---
const ExpectationSchema = z.object({
  id: z.string(),
  value: z.string(),
});

const PromptSchema = z.object({
  id: z.string(),
  prompt: z.string().min(1, 'Prompt content cannot be empty.'),
  ideal: z.string().optional(),
  should: z.array(ExpectationSchema),
  should_not: z.array(ExpectationSchema),
});

const SandboxBlueprintSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty.'),
  description: z.string().optional(),
  models: z.array(z.string()).max(10, "You can select a maximum of 10 models.").optional(),
  prompts: z.array(PromptSchema).min(1, 'At least one prompt is required.'),
  advanced: z.boolean().default(false),
});

// --- Hardcoded settings for runs ---
const QUICK_RUN_MODEL = 'openrouter:google/gemini-2.5-flash-preview-05-20';
const QUICK_RUN_JUDGE = 'openrouter:google/gemini-2.5-flash-preview-05-20';

const AVAILABLE_PLAYGROUND_MODELS = [
  "openrouter:openai/gpt-4.1-nano",
  "openrouter:anthropic/claude-3.5-haiku",
  "openrouter:mistralai/mistral-large-2411",
  "openrouter:x-ai/grok-3-mini-beta",
  "openrouter:qwen/qwen3-30b-a3b",
  "openrouter:mistralai/mistral-medium-3",
  "openrouter:deepseek/deepseek-chat-v3-0324"
];

const DEFAULT_PLAYGROUND_MODELS = [
  "openrouter:openai/gpt-4.1-nano",
  "openrouter:anthropic/claude-3.5-haiku",
  "openrouter:x-ai/grok-3-mini-beta",
  "openrouter:qwen/qwen3-30b-a3b"
];

const PLAYGROUND_TEMP_DIR = 'sandbox'; // Both run types use the same temp dir

// --- S3 Client Initialization ---
const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  const runId = `${Date.now()}-${uuidv4()}`;

  try {
    // 1. Read and validate the request body
    const body = await req.json();
    const validation = SandboxBlueprintSchema.safeParse(body);

    if (!validation.success) {
      const friendlyError = fromZodError(validation.error);
      return NextResponse.json({ error: 'Invalid blueprint data.', details: friendlyError.message }, { status: 400 });
    }
    const sandboxBlueprint = validation.data;
    const { advanced } = sandboxBlueprint;

    let modelsToUse;
    let evalMethods;
    let evaluationConfig: Record<string, any> = {};

    if (advanced) {
      // --- Advanced Mode ---
      modelsToUse = (sandboxBlueprint.models && sandboxBlueprint.models.length > 0)
        ? sandboxBlueprint.models
        : DEFAULT_PLAYGROUND_MODELS;
      
      const allModelsAreValid = modelsToUse.every(m => AVAILABLE_PLAYGROUND_MODELS.includes(m));
      if (!allModelsAreValid) {
          return NextResponse.json({ error: 'Invalid models selected. Please only use models from the allowed list.' }, { status: 400 });
      }
      
      evalMethods = ['llm-coverage', 'embedding'];
      evaluationConfig = evalMethods.reduce((acc, method) => {
        acc[method] = {};
        return acc;
      }, {} as Record<string, any>);

    } else {
      // --- Normal (Quick Run) Mode ---
      modelsToUse = [QUICK_RUN_MODEL];
      evalMethods = ['llm-coverage']; // No embeddings for quick run
      evaluationConfig = {
        'llm-coverage': {
          judges: [{ model: QUICK_RUN_JUDGE, approach: 'standard' }]
        }
      };
    }

    // 2. Transform into a full ComparisonConfig object
    const config: ComparisonConfig = {
      id: `sandbox-${runId}`,
      title: sandboxBlueprint.title,
      description: sandboxBlueprint.description,
      models: modelsToUse,
      tags: ['_sandbox_test'], // Tag all sandbox runs for the special UI
      prompts: sandboxBlueprint.prompts.map(p => ({
        id: p.id,
        prompt: p.prompt,
        ideal: p.ideal,
        should: p.should.map(s => s.value).filter(Boolean),
        should_not: p.should_not.map(s => s.value).filter(Boolean),
      })),
      evaluationConfig,
    };

    // 3. Convert to YAML
    const yamlContent = yaml.dump(config);

    // 4. Save YAML to S3
    const blueprintKey = `${PLAYGROUND_TEMP_DIR}/runs/${runId}/blueprint.yml`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: blueprintKey,
      Body: yamlContent,
      ContentType: 'application/yaml',
    }));
    
    // 5. Create initial status file
    const statusKey = `${PLAYGROUND_TEMP_DIR}/runs/${runId}/status.json`;
    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: statusKey,
        Body: JSON.stringify({ status: 'pending', message: 'Run accepted and queued.' }),
        ContentType: 'application/json',
    }));

    // 6. Invoke background function.
    const functionUrl = new URL(
      '/.netlify/functions/execute-sandbox-pipeline-background',
      process.env.URL || 'http://localhost:8888'
    );

    // Fire-and-forget the background task
    fetch(functionUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, blueprintKey }),
    }).catch(error => {
      console.error('Failed to invoke background function:', error);
    });

    // 7. Return the runId
    return NextResponse.json({ runId });

  } catch (error: any) {
    console.error('Sandbox run failed:', error);
    const statusKey = `${PLAYGROUND_TEMP_DIR}/runs/${runId}/status.json`;
     await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: statusKey,
        Body: JSON.stringify({ status: 'error', message: 'Failed to start the evaluation pipeline.', details: error.message }),
        ContentType: 'application/json',
    }));
    return NextResponse.json({ error: 'Failed to start evaluation run.', details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
