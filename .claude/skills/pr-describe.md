# pr-describe

Generate a high-quality PR description from the branch diff. When the change is
**visual** (touches UI routes/components/styles), TRY to attach before/after
screenshots — but the attempt is strictly time-boxed and **fails soft**: if
anything goes wrong, produce a clean text-only description and move on.

## Output contract

- If a PR already exists for the current branch → update its body
  (GitHub MCP `update_pull_request`).
- If no PR exists → print the finished markdown for the user to use. Do **NOT**
  open a PR unless the user explicitly asked for one.

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
- **Screenshots** — filled in by Phase 4 if applicable, else omitted.

## Phase 2 — Does the screenshot step apply?

Visual-change heuristic — TRUE if any changed file matches:
- `src/app/**/(page|layout|template).tsx`
- `src/components/**/*.tsx`
- `**/*.css`

If FALSE → skip to Phase 5 (text-only). If TRUE → continue, subject to the
give-up policy below.

## Phase 3 — Capture screenshots (time-boxed, fail-soft)

> **GIVE-UP POLICY — bail to text-only (Phase 5) and add a one-line note if ANY hold:**
> - Total screenshot phase exceeds **~6 minutes** wall-clock.
> - A dev server fails to become ready within **120s**.
> - Zero routes can be mapped (e.g. only shared components / dynamic routes changed
>   and the user gave no route to shoot).
> - The screenshot script captures nothing (`scripts/pr-screenshots.mjs` exits non-zero).
> - Any unexpected error. Never let screenshots block the description.

**3a. Determine routes** (cap at the 3 most relevant; note any you dropped):
- Map changed `src/app/**/page.tsx` to URLs (see `e2e-pr` for the mapping rules).
- Shared-component-only change → ask the user for 1-2 representative routes, OR
  skip with a note. Don't guess across the whole app.
- Skip dynamic (`[id]`) routes unless the user supplies a concrete URL.

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

GitHub renders images only from URLs, so the PNGs must be committed and pushed
before they resolve. Commit them to the PR branch and reference raw URLs:

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

> **Tradeoff:** this commits PNGs into the PR branch (they show in the diff). They
> can be deleted before merge, or — if you'd rather keep them out of the diff —
> commit them to a dedicated orphan `pr-media` branch and point the raw URLs at
> that branch instead. Default is the PR branch for simplicity.

## Phase 5 — Finalize

- Assemble the full body (Phase 1 sections + Phase 4 screenshots if any).
- If a PR exists → update its body via GitHub MCP. Else → print the markdown.
- If screenshots were skipped, include one honest line, e.g.
  _"Screenshots skipped: change is API-only"_ or _"…: dev server didn't boot in time"_.
  Never silently drop them without saying why.

## Args

- Base branch to diff against (default `origin/main`).
- Optional route list to screenshot, e.g. `--routes /about,/pairs` (overrides
  auto-detection — useful for shared-component changes).

Example: `/pr-describe` · `/pr-describe staging` · `/pr-describe --routes /about,/pairs`
