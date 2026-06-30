---
name: pr-describe
description: Generate a structured PR description from the branch diff (Summary, Changes, Test plan, Risks, Related Issues), with optional static-gated before/after screenshots for visual changes. Use when writing or updating a pull request description.
---

# pr-describe

Generate a high-quality PR description from the branch diff. The description
itself is the core deliverable and always runs. Before/after screenshots are a
**bonus that only activates on static, visual PRs** — they're strictly
time-boxed, **fail soft** (any problem → clean text-only description), and are
**off by default for data-driven routes** (see "Default screenshot scope").

## Output contract

- If a PR already exists for the current branch → update its body
  (GitHub MCP `update_pull_request`).
- If no PR exists → print the finished markdown for the user to use. Do **NOT**
  open a PR unless the user explicitly asked for one.

## Security guardrails (NON-NEGOTIABLE — this repo is public)

Screenshots publish whatever they render. On a **public** repo, anything you
commit is world-readable via raw URLs **permanently** (git history, forks, CDN
cache) — deleting the branch does NOT undo it. So:

1. **Route denylist — never screenshot these, no exceptions:**
   `/admin*`, `/api*`, and any authenticated/session/account route. If a changed
   route matches, skip it and note "omitted for safety", do not capture it.
2. **Capture only against a secret-free environment.** Use the local `pnpm dev`
   with NO real storage/API secrets wired up, so data-driven pages render
   empty/mock and there is nothing sensitive in frame. Do **not** screenshot a
   preview deploy that is backed by real data/secrets and then commit it here.
3. **Treat committed images as permanent and public.** Never tell the user they
   can "delete before merge" to undo exposure — that is false.
4. **If a capture could contain anything sensitive, do NOT commit it to the
   branch.** Prefer CI-artifact hosting (collaborator-only, auto-expiring) or a
   PR comment. Committing to the public branch is only for plainly non-sensitive,
   static UI.
5. **Surface images for human review before pushing.** Show the user what was
   captured and let them confirm; never push blind.

---

## Phase 1 — Analyze the diff (always runs)

```
git fetch origin <base> --quiet
git diff --stat origin/<base>...HEAD
git diff origin/<base>...HEAD
git log origin/<base>..HEAD --format='%s%n%b'
```

Draft the description with these sections:

- **Summary** — 1-3 sentences on what changed and why.
- **Motivation / context** — the problem or request behind it.
- **Changes** — bulleted, grouped by area (UI, API, CLI, tests, docs…).
- **Test plan** — what you ran (`pnpm typecheck`, `pnpm lint`, `pnpm test:web`,
  `pnpm test:e2e`) and the result, plus manual steps if any.
- **Risks / rollback** — the blast radius and how to undo. Call out anything
  reviewers should scrutinize (data migrations, auth/permissions, external API
  or cost impact, breaking changes, shared components touched). State how to
  revert (usually "revert this PR" — but note it if a migration or deploy step
  makes rollback non-trivial). If the change is low-risk and self-contained, say
  so in one line rather than padding.
- **Screenshots** — filled in by Phase 4 if applicable, else omitted.
- **Related Issues** — link tickets and related work. Use `Closes #123` for
  issues this PR resolves (auto-closes them on merge), `Refs #456` for related
  PRs/issues, plus any relevant docs. Omit the section entirely if there's
  nothing to link — don't invent issue numbers.

### Worked example

```md
## Summary
Tightens the site header on mobile so the nav no longer wraps under 380px.

## Motivation / context
The logo + nav links overflowed on small screens, pushing the theme toggle
off-canvas. Reported in #41.

## Changes
- **UI:** right-align nav links and shrink logo on `sm` breakpoint (`Header.tsx`)
- **UI:** swap hover underline for opacity to avoid layout shift
- **Tests:** add an e2e assertion that the header is visible at 360px width

## Test plan
- `pnpm typecheck` ✅  ·  `pnpm lint` ✅  ·  `pnpm test:e2e` ✅ (3 passed)
- Manually checked /about at 320 / 375 / 768px.

## Risks / rollback
Low-risk, CSS-only and self-contained. Revert this PR to undo.

## Screenshots
(before/after table inserted by Phase 4)

## Related Issues
Closes #41
```

## Phase 2 — Does the screenshot step apply?

Visual-change heuristic — TRUE if any changed file matches:
- `src/app/**/(page|layout|template).tsx`
- `src/components/**/*.tsx`
- `**/*.css`

If FALSE → skip to Phase 5 (text-only). If TRUE → continue, subject to the
default scope and give-up policy below.

### Default screenshot scope (practicality gate)

Screenshots only pay off on **static, secret-free routes**. Data-driven routes
(homepage, `/analysis/*`, `/pairs`, `/latest`, `/model/*`, etc.) render
empty/mock against the secret-free dev env — an uninformative shot — and cost a
slow capture. So **by default, only capture known-static routes**:

- **Default static allowlist:** `/about`, `/what-is-an-eval`. (Extend this list
  as more static pages are confirmed safe + stable.)
- Any mapped route **not** on the allowlist is **skipped by default** with a note:
  _"skipped: data-driven route (pass `--routes` to force)"_.
- The user can **override** with `--routes /foo,/bar` to force specific routes
  (e.g. against a preview deploy with real data, where they accept the tradeoff).
- The **security denylist always wins** over any override — `/admin*`, `/api*`,
  and auth routes are never captured even if explicitly passed.

If, after this gate, there are **no routes left to shoot** → skip to Phase 5
(text-only) with a one-line note. Don't boot servers for nothing.

## Phase 3 — Capture screenshots (time-boxed, fail-soft)

> **GIVE-UP POLICY — bail to text-only (Phase 5) and add a one-line note if ANY hold:**
> - Total screenshot phase exceeds **~6 minutes** wall-clock.
> - A dev server fails to become ready within **120s**.
> - Zero routes can be mapped (e.g. only shared components / dynamic routes changed
>   and the user gave no route to shoot).
> - The screenshot script captures nothing (`scripts/pr-screenshots.mjs` exits non-zero).
> - Any unexpected error. Never let screenshots block the description.

**3a. Determine routes** (cap at the 3 most relevant; note any you dropped).
Apply these filters **in order**:
1. Map changed `src/app/**/page.tsx` to URLs (see `e2e-pr` for the mapping rules).
2. **Security denylist (always, non-overridable):** drop any `/admin*`, `/api*`,
   or authenticated route; note as "omitted for safety".
3. **Default static gate (see Phase 2):** unless the user passed `--routes`, drop
   anything not on the static allowlist; note as "skipped: data-driven route".
   If `--routes` was passed, use exactly those (still subject to step 2).
4. Skip dynamic (`[id]`) routes unless the user supplies a concrete URL.
5. Shared-component-only change with nothing left → ask the user for 1-2
   representative static routes, or skip with a note. Don't guess across the app.
- Confirm the dev server has **no real storage/API secrets** in its env before
  capturing (guardrail #2). If you can't confirm that, skip screenshots.
- If no routes survive the filters → skip to Phase 5 (text-only).

Let `SLUG` = sanitized branch name, `ROUTES` = comma-separated list, e.g. `/about,/what-is-an-eval`.

**3b. Capture AFTER (current branch, HEAD).** Reuse a running dev server on
`:3172` if present, else the config/`pnpm dev` will serve it. Then:
```
node scripts/pr-screenshots.mjs --base-url http://localhost:3172 \
  --routes "$ROUTES" --out .github/pr-media/$SLUG --label after
```

**3c. Capture BEFORE (base branch) in an isolated worktree** so the working tree
is untouched. Symlink `node_modules` to avoid a slow reinstall (valid as long as
the PR didn't change dependencies — if it did, note that the "before" shot may
be approximate):
```
WT=$(mktemp -d)
git worktree add --detach "$WT" origin/<base>
ln -s "$PWD/node_modules" "$WT/node_modules"
( cd "$WT" && pnpm exec next dev -p 3173 ) &   # remember the PID
# poll http://localhost:3173/about until it responds (cap 120s)
node scripts/pr-screenshots.mjs --base-url http://localhost:3173 \
  --routes "$ROUTES" --out .github/pr-media/$SLUG --label before
# then ALWAYS clean up:
kill <pid>; git worktree remove --force "$WT"
```

If BEFORE fails but AFTER succeeded, proceed with after-only + a note.

## Phase 4 — Host & embed

> **Before any commit: re-confirm the captures are non-sensitive (guardrails
> #1–#4) and show them to the user for a quick look (guardrail #5).** Committing
> to a public branch is permanent and irreversible. If there is any doubt about
> the contents, use CI-artifact hosting instead (see "Sensitive captures" below)
> or skip embedding entirely.

GitHub renders images only from URLs, so the PNGs must be committed and pushed
before they resolve. For plainly non-sensitive, static UI, commit them to the PR
branch and reference raw URLs:

```
git add .github/pr-media/$SLUG
git commit -m "Add PR before/after screenshots"
git push
```

Derive `OWNER/REPO` from `git remote get-url origin` and `BRANCH` from
`git rev-parse --abbrev-ref HEAD`. For each route build a row:

```md
### Screenshots

#### `/about`
| Before | After |
|--------|-------|
| ![before](https://raw.githubusercontent.com/OWNER/REPO/BRANCH/.github/pr-media/SLUG/about-before.png) | ![after](https://raw.githubusercontent.com/OWNER/REPO/BRANCH/.github/pr-media/SLUG/about-after.png) |
```

(Omit the "Before" cell for routes where only the after shot exists — new pages.)

> **Tradeoff:** this commits PNGs into the PR branch and they show in the diff.
> On a public repo this is **permanent and world-readable** — do NOT claim they
> can be "deleted before merge" to undo exposure. To keep them out of the PR's
> own diff you can use a dedicated orphan `pr-media` branch, but that is still
> public; it changes visibility-in-diff, not exposure.

**Sensitive captures → don't commit; use CI artifacts instead.** If a shot could
contain anything non-public, skip the commit and have the e2e workflow upload the
images via `actions/upload-artifact` (collaborator-only, auto-expiring). Link the
run/artifact from the PR body rather than embedding a public raw URL.

## Phase 5 — Finalize

- Assemble the full body (Phase 1 sections + Phase 4 screenshots if any).
- If a PR exists → update its body via GitHub MCP. Else → print the markdown.
- If screenshots were skipped, include one honest line, e.g.
  _"Screenshots skipped: change is API-only"_ or _"…: dev server didn't boot in time"_.
  Never silently drop them without saying why.

## Args

- Base branch to diff against (default `origin/main`).
- `--routes /foo,/bar` — **override the default static-only gate** and capture
  exactly these routes (still subject to the security denylist). Use this for
  shared-component changes or when shooting a preview deploy with real data.

By default (no `--routes`), only known-static routes (`/about`,
`/what-is-an-eval`) are captured; data-driven routes are skipped with a note.

Example: `/pr-describe` · `/pr-describe staging` · `/pr-describe --routes /pairs,/latest`
