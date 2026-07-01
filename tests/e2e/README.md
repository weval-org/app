# End-to-end tests

Playwright e2e tests for the Weval web app.

## Running

```bash
pnpm test:e2e          # run the suite (auto-boots `pnpm dev` on :3172)
pnpm test:e2e:ui       # interactive UI mode
pnpm test:e2e:report   # open the last HTML report
```

You don't need to start the dev server yourself — `playwright.config.ts` has a
`webServer` block that boots `pnpm dev` and waits for `/about` to respond. If a
dev server is already running on `:3172` it is reused (locally).

To run against an already-running app (e.g. a production build or a deployed
preview) instead of booting dev:

```bash
E2E_BASE_URL=https://your-preview.example.com pnpm test:e2e
```

## Browser binary

- **Local / CI:** Playwright uses its own bundled Chromium. Install it once with
  `pnpm exec playwright install --with-deps chromium`.
- **Hosted agent sandbox:** Chromium is pre-installed at `/opt/pw-browsers`. The
  config auto-detects it (`executablePath`) and never downloads.

## What's safe to test here

Two kinds of routes are covered:

1. **Statically rendered, dependency-free routes** (`/about`,
   `/what-is-an-eval`, …) — see `smoke.spec.ts`. These need no data at all.

2. **Data-driven routes** (the homepage `/`, `/latest`, `/analysis/*`) — see
   `homepage.spec.ts`, `latest.spec.ts`, `analysis.spec.ts`. These read from
   storage but do **not** call LLMs at render time, so they work against
   seeded local fixtures without any secrets or network.

### How the data-driven fixtures work

In dev/test mode the app's `storageService` uses the `local` provider and reads
results from the `.results/` directory on disk (S3 is only used in production).
`playwright.config.ts` registers a `globalSetup` that seeds `.results/` from
`tests/e2e/fixtures/results/` **before** the dev server boots, and a
`globalTeardown` that restores it afterwards. Seeding is non-destructive: if you
already have a real local `.results/`, overwritten files are backed up and
restored and only the added files are removed.

The fixtures describe one deterministic run (`test-eval` / `test-run`); the
identifiers live in `tests/e2e/fixtures/constants.ts`. To cover another page or
data shape, add JSON under `tests/e2e/fixtures/results/` mirroring the on-disk
layout the storage service expects (e.g.
`live/aggregates/…`, `live/blueprints/<configId>/<runLabel>_<timestamp>/core.json`).

Routes that genuinely call external LLM APIs at request time (sandbox runs,
story generation, etc.) still need real env vars or `page.route(...)` mocks —
keep those out of the default suite.

## Conventions

- Prefer role/text locators (`getByRole`, `getByText`) and `a[href*="…"]` over
  brittle CSS/nth-child selectors.
- Never use hard `waitForTimeout` for synchronization — rely on web-first
  assertions (`await expect(locator).toBeVisible()`), which auto-wait.
- Add a `data-testid` to a component only when no accessible/role selector works.
