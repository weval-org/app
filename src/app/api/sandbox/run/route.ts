import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import * as yaml from 'js-yaml';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ComparisonConfig } from '@/cli/types/cli_types';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { CustomModelDefinition } from '@/lib/llm-clients/types';
import { registerCustomModels } from '@/lib/llm-clients/client-dispatcher';

// Zod schema for the incoming request body
const RunRequestSchema = z.object({
  blueprintContent: z.string().min(1, 'Blueprint content cannot be empty.'),
  isAdvanced: z.boolean().default(false),
  models: z.array(z.string()).optional(),
});

// Hardcoded settings for different run modes
const QUICK_RUN_MODEL = 'openai:gpt-4.1-mini';
const QUICK_RUN_JUDGE = 'openrouter:google/gemini-2.5-flash';
const DEFAULT_ADVANCED_MODELS = [
    "openai:gpt-4.1-mini",
    "anthropic:claude-3-haiku-20240307",
    'openrouter:google/gemini-flash-1.5'
];

const SANDBOX_V2_TEMP_DIR = 'live/sandbox';

// S3 Client Initialization
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
    // 1. Validate request body
    const body = await req.json();
    const validation = RunRequestSchema.safeParse(body);

    if (!validation.success) {
      const friendlyError = fromZodError(validation.error);
      return NextResponse.json({ error: 'Invalid request data.', details: friendlyError.message }, { status: 400 });
    }
    const { blueprintContent, isAdvanced, models: selectedModels } = validation.data;

    // 2. Parse and normalize blueprint from YAML content
    let parsedConfig: ComparisonConfig;
    try {
        parsedConfig = parseAndNormalizeBlueprint(blueprintContent, 'yaml');
    } catch (e: any) {
        return NextResponse.json({ error: 'Invalid blueprint YAML.', details: e.message }, { status: 400 });
    }
    
    // 3. Configure run based on mode (Advanced vs. Quick)
    
    // --- Custom Model Registration ---
    const customModelDefs = parsedConfig.models?.filter(m => typeof m === 'object') as CustomModelDefinition[] || [];
    if (customModelDefs.length > 0) {
        registerCustomModels(customModelDefs);
        console.log(`[Sandbox API] Registered ${customModelDefs.length} custom model definitions.`);
    }
    // --- End Custom Model Registration ---
    
    let finalModels: string[];
    let evaluationConfig: Record<string, any> = {};
    const isDev = process.env.NODE_ENV === 'development';

    if (isAdvanced) {
      // For advanced (logged-in) users, use the models they selected in the modal.
      // Fallback to blueprint's models or default if none are provided.
      const configModels = parsedConfig.models ? parsedConfig.models.map(m => typeof m === 'string' ? m : m.id) : [];
      finalModels = (selectedModels && selectedModels.length > 0)
        ? selectedModels
        : (configModels.length > 0)
            ? configModels
            : DEFAULT_ADVANCED_MODELS;

      evaluationConfig = {
        'embedding': {},
        'llm-coverage': {},
      };
    } else {
      finalModels = [QUICK_RUN_MODEL];
      evaluationConfig = {
        'embedding': {},
        'llm-coverage': {
          judges: [{ model: QUICK_RUN_JUDGE, approach: 'standard' }]
        }
      };
    }
    
    // 4. Construct the final ComparisonConfig
    let finalConfigModels: (string | CustomModelDefinition)[];
    
    if (isDev && selectedModels && selectedModels.length > 0) {
      // In development mode, preserve the full model definitions for custom models
      const requestedModelIds = new Set(selectedModels);
      const originalModels = Array.isArray(parsedConfig.models) ? parsedConfig.models : [];
      
      // Filter original models to only include those requested
      const filteredModels = originalModels.filter(model => {
        const modelId = typeof model === 'string' ? model : model.id;
        return requestedModelIds.has(modelId);
      });

      // Add any simple string models from selectedModels that weren't in the original definitions
      for (const modelId of selectedModels) {
        if (!filteredModels.some(m => (typeof m === 'string' ? m : m.id) === modelId)) {
          filteredModels.push(modelId);
        }
      }
      
      finalConfigModels = filteredModels;
    } else {
      // Production or fallback behavior - use finalModels as strings
      finalConfigModels = finalModels;
    }

    const finalConfig: ComparisonConfig = {
      ...parsedConfig,
      id: `sandbox-${runId}`,
      models: finalConfigModels,
      tags: ['_sandbox_test'],
      evaluationConfig,
    };

    // 5. Save final blueprint and initial status to S3
    const blueprintKey = `${SANDBOX_V2_TEMP_DIR}/runs/${runId}/blueprint.yml`;
    const statusKey = `${SANDBOX_V2_TEMP_DIR}/runs/${runId}/status.json`;

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: blueprintKey,
      Body: yaml.dump(finalConfig),
      ContentType: 'application/yaml',
    }));
    
    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: statusKey,
        Body: JSON.stringify({ status: 'pending', message: 'Run accepted and queued.' }),
        ContentType: 'application/json',
    }));

  // 6. Invoke the background Netlify function (fire-and-forget)
    const functionUrl = new URL('/.netlify/functions/execute-sandbox-pipeline-background', process.env.URL || 'http://localhost:8888');
    
    fetch(functionUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, blueprintKey, sandboxVersion: 'v2' }),
    }).catch(console.error);

    // 7. Return the runId to the client
    return NextResponse.json({ runId });

  } catch (error: any) {
    console.error('Sandbox v2 run failed to start:', error);
    // Attempt to update status to error
    const statusKey = `${SANDBOX_V2_TEMP_DIR}/runs/${runId}/status.json`;
     await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: statusKey,
        Body: JSON.stringify({ status: 'error', message: 'Failed to start the evaluation pipeline.', details: error.message }),
        ContentType: 'application/json',
    })).catch(console.error); // Best-effort error reporting

    return NextResponse.json({ error: 'Failed to start evaluation run.', details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'; 