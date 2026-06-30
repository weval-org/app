# lint-pr

Run Next.js ESLint on files changed in the current branch and report new lint errors.

## Steps

1. Find changed JS/TS/TSX files:
   ```
   git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx'
   ```

2. Run lint on the changed files only (faster than full lint):
   ```
   pnpm exec next lint --file <file1> --file <file2> ...
   ```
   If there are more than 20 changed files, run the full lint instead:
   ```
   pnpm lint
   ```

3. Report:
   - Pass/fail overall
   - Each error and warning with file path, line number, rule name, and message
   - Distinguish errors (must fix) from warnings (should fix)
   - If zero issues: confirm clean

4. Do NOT auto-fix lint errors unless the user explicitly passes `--fix` as an arg.
   If `--fix` is passed, run `pnpm lint:fix` on the changed files and show a diff of what changed.

## Args

Optional: `--fix` to automatically apply safe lint fixes.

Example: `/lint-pr` or `/lint-pr --fix`
