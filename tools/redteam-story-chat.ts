/*
  Red-team harness for /api/story/chat
  - Runs a set of realistic scenarios
  - Streams and parses responses using the same parser as the app
  - Saves outputs (visible text, CTAs, system instructions) under tools/redteam-out/

  Usage:
    pnpm debug:story:redteam
    pnpm debug:story:redteam --url http://localhost:3000
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamingParser } from '../src/lib/story-utils/streaming-parser';

type ConversationMessage = { role: 'user' | 'assistant'; content: string };

type Scenario = {
  id: string;
  msg: string;
  blueprintYamlPath?: string; // optional path to YAML to include in <SYSTEM_STATUS>
  quickRunResultPath?: string; // optional path to JSON to include in <SYSTEM_STATUS>
  noStream?: boolean;
};

function parseArgs(argv: string[]) {
  const args: { url: string } = { url: process.env.STORY_CHAT_URL || 'http://localhost:3000' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--url' && next) { args.url = next; i++; continue; }
  }
  return args;
}

function nowStamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-');
}

async function readIfExists(p?: string) {
  if (!p) return undefined;
  const abs = path.resolve(process.cwd(), p);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : undefined;
}

async function readJsonIfExists(p?: string) {
  if (!p) return undefined;
  const abs = path.resolve(process.cwd(), p);
  return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf8')) : undefined;
}

async function runScenario(baseUrl: string, outDir: string, s: Scenario) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/story/chat`;
  const blueprintYaml = await readIfExists(s.blueprintYamlPath);
  const quickRunResult = await readJsonIfExists(s.quickRunResultPath);

  const body = {
    messages: [{ role: 'user', content: s.msg } as ConversationMessage],
    blueprintYaml: blueprintYaml ?? null,
    quickRunResult: quickRunResult ?? null,
    ...(s.noStream ? { noStream: true } : {}),
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const caseDir = path.join(outDir, s.id);
  fs.mkdirSync(caseDir, { recursive: true });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    fs.writeFileSync(path.join(caseDir, 'error.txt'), `HTTP ${res.status}\n${txt}`);
    console.error(`[${s.id}] HTTP ${res.status}`);
    return;
  }

  if (s.noStream) {
    const json = await res.json();
    fs.writeFileSync(path.join(caseDir, 'nonstream.json'), JSON.stringify(json, null, 2));
    console.log(`[${s.id}] non-stream OK`);
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
    parser.ingest(str);
  }

  const finalParsed = parser.finalize();
  fs.writeFileSync(path.join(caseDir, 'visible.txt'), finalParsed.visibleContent || '');
  fs.writeFileSync(path.join(caseDir, 'system_instructions.json'), JSON.stringify(finalParsed.systemInstructions, null, 2));
  fs.writeFileSync(path.join(caseDir, 'meta.json'), JSON.stringify({ chunkCount, totalBytes }, null, 2));

  console.log(`[${s.id}] stream OK; chunks=${chunkCount}, bytes=${totalBytes}`);
}

async function main() {
  const args = parseArgs(process.argv);

  const scenarios: Scenario[] = [
    {
      id: 'clear_intent',
      msg: 'Hello! I want to evaluate AI responses that help new parents with neonatal emergencies.',
    },
    {
      id: 'vague_one_liner',
      msg: 'test',
    },
    {
      id: 'running_now',
      msg: 'Im running it now',
    },
    {
      id: 'refine_outline',
      msg: 'Refine the outline: emphasize fever thresholds and when to call a doctor.',
      blueprintYamlPath: 'examples/blueprints/clarify.yml',
    },
    {
      id: 'no_stream_probe',
      msg: 'Quick non-stream probe',
      noStream: true,
    },
  ];

  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'redteam-out', `story-${nowStamp()}`);
  fs.mkdirSync(outDir, { recursive: true });
  console.log('[REDTEAM] baseUrl=', args.url, 'outDir=', outDir);

  for (const s of scenarios) {
    try {
      await runScenario(args.url, outDir, s);
    } catch (e: any) {
      console.error(`[${s.id}] failed:`, e?.message || e);
    }
  }

  console.log('[REDTEAM] done');
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


