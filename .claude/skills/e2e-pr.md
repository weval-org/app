# e2e-pr

Run the Playwright end-to-end suite against the routes a PR touches, and report results.

## Prerequisites

- `@playwright/test` is installed and `playwright.config.ts` exists at the repo root.
- The config auto-boots `pnpm dev` (its `webServer` block) and waits for `/about`,
  so you do NOT need to start a server yourself unless one is already running.
- In CI the browser comes from `playwright install`; in the hosted sandbox it's
  the pre-installed Chromium at `/opt/pw-browsers`. The config handles both.

## Steps

1. **Find changed files** vs the base branch (default `origin/main`):
   ```
   git diff --name-only origin/main...HEAD
   ```

2. **Map changed files to affected routes** (best-effort):
   - `src/app/(group)/foo/page.tsx` → `/foo` (drop `src/app`, drop `(route-group)`
     segments, drop the trailing `/page.tsx`)
   - `src/app/(standard)/page.tsx` → `/`
   - `layout.tsx` / `template.tsx` changes affect every route beneath them.
   - Dynamic segments (`[id]`) can't be visited without a concrete value — note
     them but don't try to test them blindly.
   - Changes under `src/components/**` are shared and can't be mapped to a single
     route → treat as "broad" (run the whole suite).

3. **Choose scope:**
   - If specific route files changed and there are specs covering them, run those:
     ```
     pnpm test:e2e -g "<route or feature keyword>"
     ```
     or pass specific spec files: `pnpm test:e2e tests/e2e/<file>.spec.ts`
   - If changes are broad (shared components, layout, config) OR the suite is
     small, just run everything: `pnpm test:e2e`

4. **Run** the chosen command. The first run cold-compiles routes in `next dev`,
   so allow time — the config already uses generous timeouts.

5. **Report:**
   - Pass/fail, number of tests run, and any failures with their error message.
   - On failure, point to the HTML report (`pnpm test:e2e:report`) and the trace
     (saved under `test-results/` on first retry).
   - Call out any changed routes that have NO e2e coverage as gaps (not failures),
     so the author can decide whether to add a spec.

## Notes

- Data-dependent routes (homepage, `/analysis/*`) need env/secrets or network
  mocking — see `tests/e2e/README.md`. Don't add flaky assertions on them.
- Do NOT auto-write new specs here; that's authoring. This skill runs existing
  tests. (Use `pr-describe` or a dedicated authoring step to add coverage.)

## Args

Optional base branch to diff against (default `origin/main`).

Example: `/e2e-pr` or `/e2e-pr staging`
