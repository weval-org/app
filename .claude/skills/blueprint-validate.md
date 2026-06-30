# blueprint-validate

Validate Weval blueprint YAML/JSON files changed in the current branch. This mirrors Layer 1 of the three-layer PR evaluation system described in `docs/PR_EVALUATION_SETUP.md`.

## Steps

1. Find changed blueprint files:
   ```
   git diff --name-only origin/main...HEAD -- 'examples/**' '*.yaml' '*.yml' '*.json'
   ```
   Focus on files in `examples/blueprints/` or any `.yaml`/`.json` blueprint files.

2. For each changed blueprint file, validate:

   **Structural checks:**
   - Parse YAML/JSON — if it fails to parse, report the syntax error immediately
   - Required top-level fields: `id`, `prompts` (check `docs/BLUEPRINT_FORMAT.md` for full schema)
   - `id` must be a non-empty string
   - `prompts` must be a non-empty array
   - Each prompt must have the required fields

   **Size/cost checks (staging limits from Layer 2):**
   - Warn if prompt count > 10 (would be auto-trimmed in staging eval)
   - Warn if model list is large (only CORE models supported in staging)
   - Note: these are warnings, not errors — production evals have no limits

   **Security check:**
   - If the file is under `blueprints/users/{username}/`, the username in the path must match the PR author
   - Get the PR author from `git log --format='%ae' -1` or from GitHub context if available

3. For any blueprint that passes validation, summarize:
   - Number of prompts
   - Models targeted
   - Estimated staging evaluation scope (after auto-trim if applicable)

4. Report:
   - ✅ or ❌ per file with specific error details
   - Warnings for staging-limit exceedances
   - A final pass/fail verdict

## Args

Optional: path to a specific blueprint file to validate instead of scanning changed files.

Example: `/blueprint-validate` or `/blueprint-validate examples/blueprints/my-blueprint.yaml`
