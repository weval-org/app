# test-pr

Run Jest tests for files changed in the current branch compared to main.

## Steps

1. Find changed files:
   ```
   git diff --name-only origin/main...HEAD
   ```

2. Identify which changed files have corresponding tests or ARE test files. Test files live in:
   - Same directory as source with `.test.ts` / `.test.tsx` suffix
   - `src/point-functions/` tests are colocated
   - Jest configs: `jest.config.js` (web) and `jest.config.cli.js` (CLI)

3. Decide which test suite(s) to run:
   - If changes touch `src/app/`, `src/components/`, `src/hooks/` → web suite: `pnpm test:web`
   - If changes touch `src/cli/`, `src/lib/` → CLI suite: `pnpm test:cli`
   - If changes touch `src/point-functions/` → web suite (tests are colocated)
   - Run both suites if changes span both areas

4. Run only the tests for changed/affected files where possible:
   - For targeted runs: `pnpm test:web -- --testPathPattern="<pattern>"`
   - If no specific pattern can be identified, run the full relevant suite

5. Report:
   - Pass/fail status
   - Number of test suites and tests run
   - Any failing tests with their error messages
   - Which files were changed that had no test coverage (note as gaps, not failures)

## Args

Optional: a PR number or branch name to compare against. Defaults to `origin/main`.

Example: `/test-pr 42` or `/test-pr feature/my-branch`
