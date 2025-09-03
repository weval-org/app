import type { ComparisonConfig } from '@/cli/types/cli_types';
import { getConfig } from '@/cli/config';
import { buildDeckXml, parseResponsesXml, validateResponses } from '@/cli/services/consumer-deck';
import { startConsumerUIServer } from '@/cli/services/consumer-ui-server';
import crypto from 'crypto';
import { exec } from 'child_process';
import { getCache, generateCacheKey } from '@/lib/cache-service';

type Logger = ReturnType<typeof getConfig>['logger'];

export async function collectConsumerSlices(
  config: ComparisonConfig,
  logger: Logger,
  consumerModels: string[],
): Promise<{ slicesByConsumer: Map<string, Map<number, Map<string, string>>> }>{
  const sysVariants: (string | null)[] = Array.isArray(config.systems) && config.systems.length > 0
    ? config.systems
    : [config.system ?? null];

  const slicesByConsumer: Map<string, Map<number, Map<string, string>>> = new Map();
  const consumerCache = getCache('consumer-decks');
  const reuseConsumer = (process.env.CONSUMER_REUSE || '').toLowerCase() !== 'off';

  for (const consumerId of consumerModels) {
    const perSys = new Map<number, Map<string, string>>();
    for (let sysIdx = 0; sysIdx < sysVariants.length; sysIdx++) {
      const sysText = sysVariants[sysIdx] ?? null;
      const deckXml = buildDeckXml(config, { systemPrompt: sysText });

      const deckKey = generateCacheKey({ t: 'consumer-deck', configId: config.id, consumerId, sysIdx, deckXml });
      if (reuseConsumer) {
        const cached = await consumerCache.get(deckKey);
        if (cached && typeof cached === 'string') {
          await logger.info(`[ConsumerService] Cache HIT for ${consumerId} sys ${sysIdx}.`);
          perSys.set(sysIdx, parseResponsesXml(cached));
          continue;
        }
        await logger.info(`[ConsumerService] Cache MISS for ${consumerId} sys ${sysIdx}.`);
      } else {
        await logger.info(`[ConsumerService] Reuse disabled for ${consumerId} sys ${sysIdx}.`);
      }

      const token = crypto.randomBytes(16).toString('hex');
      let submittedMap: Map<string, string> | null = null;
      let submittedRaw: string | null = null;
      const ui = await startConsumerUIServer({
        deckXml,
        token,
        variantLabel: `System ${sysIdx} · Consumer ${consumerId}`,
        onSubmit: async (responsesXml: string) => {
          try {
            const map = parseResponsesXml(responsesXml);
            const expectedIds = (config.prompts || []).map(p => p.id);
            const v = validateResponses(expectedIds, map);
            if (!v.ok) return { ok: false, error: `Missing: [${v.missing.join(', ')}] Extra: [${v.extra.join(', ')}]` };
            submittedMap = map;
            submittedRaw = responsesXml;
            return { ok: true };
          } catch (e: any) {
            return { ok: false, error: e?.message || 'Parse error' };
          }
        },
        onClose: () => {}
      });
      const url = ui.url;
      await logger.info(`[ConsumerService] UI available at: ${url}`);
      const shouldOpen = !(process.env.CONSUMER_NO_OPEN === 'true' || (process as any).env?.JEST_WORKER_ID);
      if (shouldOpen) {
        try { exec(`${process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'} ${url}`); } catch {}
      }

      const timeoutMs = process.env.CONSUMER_TIMEOUT_MIN ? (parseInt(process.env.CONSUMER_TIMEOUT_MIN, 10) * 60 * 1000) : (30 * 60 * 1000);
      const consumerSlices = await new Promise<Map<string, string>>((resolve) => {
        const timer = setTimeout(async () => {
          try { await ui.close(); } catch {}
          resolve(new Map());
        }, timeoutMs);
        const iv = setInterval(async () => {
          if (submittedMap) {
            clearTimeout(timer);
            clearInterval(iv);
            try { await ui.close(); } catch {}
            resolve(submittedMap!);
          }
        }, 250);
      });

      if (submittedRaw && reuseConsumer) {
        await consumerCache.set(deckKey, submittedRaw);
        await logger.info(`[ConsumerService] Cached responses for ${consumerId} sys ${sysIdx}.`);
      }
      perSys.set(sysIdx, consumerSlices);
    }
    slicesByConsumer.set(consumerId, perSys);
  }

  return { slicesByConsumer };
}


