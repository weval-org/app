---
name: pr-check
description: Run the full quality gate on the current branch — TypeScript typecheck, ESLint, web/CLI Vitest tests, and blueprint validation — then summarize pass/fail. Use before opening a PR, or to check whether a branch is CI-ready.
---

# pr-check

Run a full quality gate on the current branch before or after a PR is created. Orchestrates type checking, linting, and tests, then produces a structured summary.

## Steps

1. **Identify scope** — get the diff summary:
   ```
   git diff --stat origin/main...HEAD
   ```
   Note whether changes touch: source code, blueprint files, tests, docs, config.

2. **Run checks in parallel where possible** (report results as each finishes):

   | Check | Command | When to run |
   |-------|---------|-------------|
   | TypeScript | `pnpm typecheck` | Always |
   | Lint | `pnpm lint` | Always |
   | Web tests | `pnpm test:web` | If `src/app/`, `src/components/`, `src/hooks/`, or `src/point-functions/` changed |
   | CLI tests | `pnpm test:cli` | If `src/cli/` or `src/lib/` changed |
   | Blueprint validate | see `blueprint-validate` skill | If any `.yaml`/`.yml`/`.json` blueprint files changed |

3. **Collect results** — for each check record:
   - Status: ✅ pass / ❌ fail / ⚠️ warnings / ⏭️ skipped (not applicable)
   - Error/warning count
   - Key details (first 5 errors max per check to keep output readable)

4. **Produce a summary table:**
   ```
   ## PR Check Results — <branch-name>

   | Check         | Status | Details                  |
   |---------------|--------|--------------------------|
   | TypeScript    | ✅     | 0 errors                 |
   | Lint          | ⚠️     | 2 warnings, 0 errors     |
   | Web tests     | ✅     | 47 passed                |
   | CLI tests     | ⏭️     | No CLI files changed     |
   | Blueprints    | ✅     | 1 file validated         |

   **Overall: READY TO MERGE** / **NEEDS FIXES**
   ```

5. If any check fails, list the specific errors that need to be addressed.

6. If `--comment` is passed as an arg, post this summary as a GitHub PR comment using the available GitHub MCP tools.

## Args

- `--comment`: Post the results as a GitHub PR comment (requires PR number to be detectable from the branch)
- Base branch (e.g. `main`, `staging`): defaults to `origin/main`

Example: `/pr-check` or `/pr-check --comment` or `/pr-check staging`
