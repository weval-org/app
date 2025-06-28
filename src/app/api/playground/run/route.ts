import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { handler as backgroundHandler } from '../../../../../netlify/functions/execute-playground-pipeline-background';

// --- Zod Validation Schema for incoming playground data ---
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

const PlaygroundBlueprintSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty.'),
  description: z.string().optional(),
  prompts: z.array(PromptSchema).min(1, 'At least one prompt is required.'),
});

// --- Hardcoded settings for playground runs ---
const PLAYGROUND_MODELS = [
  "openrouter:openai/gpt-4.1-nano",
  "openrouter:anthropic/claude-3.5-haiku",
  // "openrouter:mistralai/mistral-large-2411",
  "openrouter:x-ai/grok-3-mini-beta",
  "openrouter:qwen/qwen3-30b-a3b"
];
const PLAYGROUND_EVAL_METHODS = ['llm-coverage', 'embedding'];
const PLAYGROUND_TEMP_DIR = 'playground';


// --- S3 Client Initialization ---
const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

// Lazy-loaded Netlify client
let netlifyClient: any;

async function getNetlifyClient() {
  if (!netlifyClient) {
    const { NetlifyAPI } = await import('netlify');
    netlifyClient = new NetlifyAPI(process.env.NETLIFY_API_TOKEN);
  }
  return netlifyClient;
}

export async function POST(request: Request) {
  const runId = uuidv4();

  try {
    // 1. Read and validate the request body
    const body = await request.json();
    const validation = PlaygroundBlueprintSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid blueprint data.', details: validation.error.flatten() }, { status: 400 });
    }
    const playgroundBlueprint = validation.data;

    // 2. Transform into a full ComparisonConfig object
    const config = {
      id: `playground-${runId}`,
      title: playgroundBlueprint.title,
      description: playgroundBlueprint.description,
      models: PLAYGROUND_MODELS,
      prompts: playgroundBlueprint.prompts.map(p => ({
        id: p.id,
        prompt: p.prompt,
        ideal: p.ideal,
        // The parser expects an array of strings for simple points
        should: p.should.map(s => s.value).filter(Boolean),
        should_not: p.should_not.map(s => s.value).filter(Boolean),
      })),
      evaluationConfig: PLAYGROUND_EVAL_METHODS.reduce((acc, method) => {
        acc[method] = {};
        return acc;
      }, {} as Record<string, any>),
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
      '/.netlify/functions/execute-playground-pipeline-background',
      process.env.URL || 'http://localhost:8888'
    );

    // Fire-and-forget the background task
    fetch(functionUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, blueprintKey }),
    }).catch(error => {
      // This will only catch network errors, not server-side errors in the function.
      // We'll log it, but the primary error handling is inside the background function itself.
      console.error('Failed to invoke background function:', error);
    });

    // 7. Return the runId
    return NextResponse.json({ runId });

  } catch (error: any) {
    console.error('Playground run failed:', error);
    // Also save an error status file to S3 so the frontend polling can see it
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
