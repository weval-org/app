import { NextRequest, NextResponse } from 'next/server';
import { saveJsonFile, getJsonFile } from '@/lib/storageService';
import { generateMinimalBlueprintYaml } from '@/app/sandbox/utils/yaml-generator';
import { getLogger } from '@/utils/logger';
import { z } from 'zod';
import type { ComparisonConfig } from '@/cli/types/cli_types';

const exportRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  outlineObj: z.object({}).passthrough(), // Blueprint structure
  quickRunResult: z.any().optional(), // Optional test results
});

export async function GET(req: NextRequest) {
  const logger = await getLogger('story:export:get');

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('id');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Fetch the blueprint
    const blueprintKey = `live/story/exports/${sessionId}.yml`;
    const blueprintData = await getJsonFile<{ yaml: string; blueprint: any }>(blueprintKey);

    if (!blueprintData) {
      logger.warn(`[story:export:get] Blueprint not found: ${sessionId}`);
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    // Fetch metadata (optional)
    const metadataKey = `live/story/exports/${sessionId}_meta.json`;
    const metadata = await getJsonFile(metadataKey);

    logger.info(`[story:export:get] Retrieved export for session ${sessionId}`);

    return NextResponse.json({
      sessionId,
      yaml: blueprintData.yaml,
      blueprint: blueprintData.blueprint,
      metadata,
    });

  } catch (error: any) {
    logger.error(`[story:export:get] Failed: ${error?.message || error}`);
    return NextResponse.json({
      error: 'Failed to retrieve exported blueprint',
      details: error?.message
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const logger = await getLogger('story:export');

  try {
    const body = await req.json();
    const validationResult = exportRequestSchema.safeParse(body);

    if (!validationResult.success) {
      logger.warn(`[story:export] Validation failed: ${validationResult.error.message}`);
      return NextResponse.json({
        error: 'Invalid request',
        details: validationResult.error.issues
      }, { status: 400 });
    }

    const { sessionId, outlineObj, quickRunResult } = validationResult.data;

    // Generate the YAML representation
    const yamlContent = generateMinimalBlueprintYaml(outlineObj as unknown as ComparisonConfig);

    // Save blueprint YAML
    const blueprintKey = `live/story/exports/${sessionId}.yml`;
    await saveJsonFile(blueprintKey, { yaml: yamlContent, blueprint: outlineObj });

    // Save metadata (including quick run results if available)
    const metadataKey = `live/story/exports/${sessionId}_meta.json`;
    await saveJsonFile(metadataKey, {
      sessionId,
      exportedAt: new Date().toISOString(),
      quickRunResult: quickRunResult || null,
    });

    logger.info(`[story:export] Successfully exported session ${sessionId}`);

    return NextResponse.json({
      exportId: sessionId,
      blueprintKey,
      message: 'Blueprint exported successfully',
    });

  } catch (error: any) {
    logger.error(`[story:export] Failed: ${error?.message || error}`);
    return NextResponse.json({
      error: 'Failed to export blueprint',
      details: error?.message
    }, { status: 500 });
  }
}
