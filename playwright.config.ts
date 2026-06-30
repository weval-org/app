import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * In the hosted agent sandbox, Chromium is pre-installed at this path and
 * `playwright install` is disabled. When the binary is present we point
 * Playwright at it directly; otherwise (local dev, CI) we let Playwright use
 * its own bundled browser installed via `playwright install chromium`.
 */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;

const PORT = 3172;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 45_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  /**
   * When E2E_BASE_URL is set we assume the app is already running (e.g. a
   * production build or a remote deploy) and skip booting a dev server.
   * Otherwise boot `pnpm dev`; the readiness probe hits /about — a static,
   * dependency-free route — which also pre-compiles it so the first test is fast.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: `http://localhost:${PORT}/about`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
