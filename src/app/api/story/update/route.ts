import { NextRequest, NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { UPDATER_SYSTEM_PROMPT } from '../utils/prompt-constants';
import { parseWevalConfigFromResponse } from '@/app/sandbox/utils/json-response-parser';
import { resilientLLMCall, validateStoryResponse } from '../utils/llm-resilience';

type UpdateRequestBody = {
  currentJson: any; // existing blueprint object
  guidance: string; // short textual guidance
};

export async function POST(req: NextRequest) {
  const logger = await getLogger('story:update');
  configure({
    logger: {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      error: (m) => logger.error(m),
      success: (m) => logger.info(m),
    },
    errorHandler: (err) => logger.error(`[story:update] error: ${err?.message || err}`),
  });

  try {
    const body = (await req.json()) as UpdateRequestBody;
    const currentJson = body?.currentJson;
    const guidance = (body?.guidance || '').trim();
    if (!currentJson || !guidance) {
      return NextResponse.json({ error: 'currentJson and guidance are required' }, { status: 400 });
    }

    const messages = [
      { role: 'user' as const, content: `<CURRENT_JSON>${JSON.stringify(currentJson)}</CURRENT_JSON>\n<GUIDANCE>${guidance}</GUIDANCE>` },
    ];

    logger.info(`[story:update][payload] guidance.len=${guidance.length} current.size=${JSON.stringify(currentJson).length}`);

    const raw = await resilientLLMCall({
      messages,
      systemPrompt: UPDATER_SYSTEM_PROMPT,
      temperature: 0.0,
      useCache: false,
      maxRetries: 1,
      backoffMs: 1000,
    });

    if (!validateStoryResponse(raw, 'json')) {
      logger.warn(`[story:update][diag] invalid_format_response len=${(raw || '').length}`);
      throw new Error('The model did not return valid JSON format.');
    }

    const parsed = await parseWevalConfigFromResponse(raw);
    if (parsed.validationError) {
      logger.warn(`[story:update][diag] validation_error: ${parsed.validationError}`);
    }

    return NextResponse.json({ data: parsed.data, yaml: parsed.yaml, sanitized: parsed.sanitized, validationError: parsed.validationError });
  } catch (err: any) {
    logger.error(`[story:update] failed: ${err?.message || err}`);
    return NextResponse.json({ error: 'Failed to update evaluation.' }, { status: 500 });
  }
}


