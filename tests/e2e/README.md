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

Smoke tests deliberately target **statically rendered, dependency-free routes**
(`/about`, `/what-is-an-eval`, …) so they pass in CI without any secrets.

Routes that read from storage (S3) or call external LLM APIs — the homepage,
`/analysis/*`, `/latest`, etc. — will be slow or error without env/network. To
cover those, either:

- provide the relevant env vars (see `.env.template`), or
- intercept network calls with `page.route(...)` and serve fixtures.

Keep flaky, data-dependent assertions out of the default suite.

## Conventions

- Prefer role/text locators (`getByRole`, `getByText`) and `a[href*="…"]` over
  brittle CSS/nth-child selectors.
- Never use hard `waitForTimeout` for synchronization — rely on web-first
  assertions (`await expect(locator).toBeVisible()`), which auto-wait.
- Add a `data-testid` to a component only when no accessible/role selector works.
