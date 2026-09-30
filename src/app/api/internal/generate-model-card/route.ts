import { NextRequest, NextResponse } from 'next/server';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { actionGenerateModelCard } from '@/cli/commands/generate-model-card';

// A substring of base model IDs, as the generate-model-card CLI takes it
// (e.g. "apertus-v1.5-70b", "claude-3-5-sonnet", "openai:gpt-4o").
const PATTERN_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,99}$/;

/**
 * Runs the generate-model-card CLI command on the server, where the storage
 * and OpenRouter credentials live. Triggered by the "Generate Model Card"
 * GitHub workflow.
 */
export async function POST(req: NextRequest) {
  const authError = checkBackgroundAuth(req);
  if (authError) return authError;

  let pattern: unknown;
  try {
    ({ pattern } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
  }
  if (typeof pattern !== 'string' || !PATTERN_RE.test(pattern)) {
    return NextResponse.json({ error: "Missing or invalid 'pattern'." }, { status: 400 });
  }

  const logger = await getLogger(`model-card:${pattern}`);
  configure({
    errorHandler: (error: Error) => logger.error(`CLI Error: ${error.message}`, error),
    logger: {
      info: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      success: (msg: string) => logger.info(msg),
    },
  });

  await actionGenerateModelCard(pattern, {});
  return NextResponse.json({ message: 'Model card generation finished.', pattern });
}
