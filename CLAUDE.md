# Repo guidance for Claude Code

## Pull requests

Whenever you (or any agent) open a pull request in this repo, the PR description
**must be filled out** — never leave it blank or as the raw template.

1. **Always run the `/pr-describe` skill before or immediately after opening a
   PR.** It generates a structured description (Summary, Motivation, Changes,
   Test plan, Risks / rollback, Related Issues) from the branch diff and matches
   `.github/pull_request_template.md`. If a PR already exists for the branch, it
   updates the title and body in place.
2. The `.github/pull_request_template.md` sections are **required**. A CI check
   (`.github/workflows/pr-description-check.yml`) runs on every PR open/edit and
   will nudge with a comment if `Summary`, `Changes`, `Test plan`, or
   `Risks / rollback` are missing or empty. Fill them out so the check passes.
3. Consider running `/pr-check` (quality gate) before opening the PR so the
   Test plan reflects real results.
