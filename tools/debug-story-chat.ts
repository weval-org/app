/*
  Debug script to exercise /api/story/chat with streaming.
  Usage examples:
    pnpm debug:story:chat --url http://localhost:3000 --msg "Im running it now" --repeat 3
    pnpm debug:story:chat --msg "Make an outline for neonatal healthcare" --blueprint-yaml examples/blueprints/clarify.yml
    pnpm debug:story:chat --msg "Discuss results" --quickrun-json /path/to/result.json
*/

import fs from 'node:fs';
import path from 'node:path';

// Reuse the streaming parser used by the app so behavior matches UI
import { StreamingParser } from '../src/lib/story-utils/streaming-parser';

type ConversationMessage = { role: 'user' | 'assistant'; content: string };

type Args = {
  url: string;
  msg: string;
  repeat: number;
  blueprintYaml?: string;
  quickRunResult?: any;
  noStream?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    url: 'http://localhost:3000',
    msg: 'Hello',
    repeat: 1,
  } as any;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--url' && next) { args.url = next; i++; continue; }
    if (a === '--msg' && next) { args.msg = next; i++; continue; }
    if (a === '--repeat' && next) { args.repeat = Math.max(1, Number(next) || 1); i++; continue; }
    if (a === '--blueprint-yaml' && next) {
      const p = path.resolve(process.cwd(), next);
      args.blueprintYaml = fs.readFileSync(p, 'utf8');
      i++; continue;
    }
    if (a === '--quickrun-json' && next) {
      const p = path.resolve(process.cwd(), next);
      args.quickRunResult = JSON.parse(fs.readFileSync(p, 'utf8'));
      i++; continue;
    }
    if (a === '--no-stream') { args.noStream = true; continue; }
  }

  return args;
}

async function runOnce(args: Args, iteration: number) {
  const endpoint = `${args.url.replace(/\/$/, '')}/api/story/chat`;
  const body = {
    messages: [
      { role: 'user', content: args.msg } as ConversationMessage,
    ],
    blueprintYaml: args.blueprintYaml ?? null,
    quickRunResult: args.quickRunResult ?? null,
    ...(args.noStream ? { noStream: true } : {}),
  };

  const start = Date.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error(`\n[ITER ${iteration}] HTTP ${res.status}: ${txt}`);
    return;
  }

  if (args.noStream) {
    const json = await res.json();
    console.log(`\n[ITER ${iteration}] Non-stream reply:`);
    console.log(json);
    return;
  }

  const parser = new StreamingParser();
  let chunkCount = 0;
  let totalBytes = 0;
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunkCount++;
    const str = decoder.decode(value, { stream: true });
    totalBytes += str.length;
    const parsed = parser.ingest(str);
    // Live trace of visible content growth
    process.stdout.write('.');
    if (parsed.streamError) {
      console.error(`\n[ITER ${iteration}] Stream error: ${parsed.streamError}`);
      break;
    }
  }

  const finalParsed = parser.finalize();
  const ms = Date.now() - start;
  console.log(`\n[ITER ${iteration}] Stream complete in ${ms}ms, chunks=${chunkCount}, bytes=${totalBytes}`);
  console.log('[RESULT] visibleContent:');
  console.log(finalParsed.visibleContent || '(empty)');
  console.log('[RESULT] systemInstructions:', finalParsed.systemInstructions);
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('[SETUP]', { url: args.url, msg: args.msg, repeat: args.repeat, withOutline: Boolean(args.blueprintYaml), withQuickRun: Boolean(args.quickRunResult), noStream: Boolean(args.noStream) });
  for (let i = 1; i <= args.repeat; i++) {
    await runOnce(args, i);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


