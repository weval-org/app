// Capture full-page screenshots of routes, for PR before/after comparisons.
//
// Usage:
//   node scripts/pr-screenshots.mjs \
//     --base-url http://localhost:3172 \
//     --routes /about,/what-is-an-eval \
//     --out .github/pr-media/my-branch \
//     --label after
//
// Designed to FAIL SOFT: a route that errors or times out is skipped (and
// logged), not fatal, so the orchestrating skill can still produce a partial
// result. Exits non-zero only if NOTHING was captured.
//
// Reuses the @playwright/test Chromium (no extra dependency). In the hosted
// sandbox it launches the pre-installed browser at /opt/pw-browsers/chromium.

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const baseUrl = arg('base-url', 'http://localhost:3172').replace(/\/$/, '');
const routes = arg('routes', '/')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);
const outDir = arg('out', '.github/pr-media');
const label = arg('label', 'after');
const viewport = {
  width: Number(arg('width', '1280')),
  height: Number(arg('height', '800')),
};
const perRouteTimeoutMs = Number(arg('timeout', '45000'));

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;

function slug(route) {
  const s = route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return s || 'home';
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport });
const results = [];

for (const route of routes) {
  const page = await context.newPage();
  const file = path.join(outDir, `${slug(route)}-${label}.png`);
  try {
    // 'load' (not 'networkidle') — Next.js dev keeps an HMR websocket open,
    // so networkidle would never settle.
    await page.goto(`${baseUrl}${route}`, {
      waitUntil: 'load',
      timeout: perRouteTimeoutMs,
    });
    await page.waitForTimeout(750); // let fonts/animations settle
    await page.screenshot({ path: file, fullPage: true });
    results.push({ route, file, ok: true });
    console.log(`OK   ${route} -> ${file}`);
  } catch (err) {
    results.push({ route, ok: false, error: String(err?.message || err) });
    console.log(`FAIL ${route}: ${err?.message || err}`);
  } finally {
    await page.close();
  }
}

await context.close();
await browser.close();

const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${routes.length} screenshots captured in ${outDir}`);
process.exit(ok > 0 ? 0 : 1);
