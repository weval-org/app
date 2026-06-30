# typecheck-pr

Run TypeScript type checking on the project and surface errors introduced by the current branch.

## Steps

1. Get the list of changed `.ts` / `.tsx` files:
   ```
   git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx'
   ```

2. Run the full type check (tsc checks the whole project, not individual files):
   ```
   pnpm typecheck
   ```
   This runs `tsc --noEmit` using the root `tsconfig.json`.

3. If the full typecheck fails, compare against main to isolate which errors are NEW:
   - Note the total error count from the current branch
   - Optionally stash changes, run `pnpm typecheck` on main, then restore — but only do this if there are errors and the user needs to know which are pre-existing vs. introduced

4. Report:
   - Overall pass/fail
   - List of NEW type errors introduced by this branch (file, line, error message)
   - Count of pre-existing errors if any (so the author knows what's theirs to fix)
   - Flag any errors in files the PR didn't touch (may indicate type cascades from interface changes)

## Args

Optional: base branch to compare against. Defaults to `origin/main`.
