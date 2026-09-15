---
name: pubky-code-review
description: Run a local code review of a diff against this repo's architecture rules (AGENTS.md, .greptile/config.json) and quality standards. Use when the user asks to review code, check for violations, or audit changes before opening a PR.
---

# Local Code Review

Review a change against the project's rules with three focused read-only reviewers, a deterministic callouts pass, and the project's own checks when they are available. Print one status line once the scope is known, then the report. Do not narrate the steps in between.

## Step 1 — Determine the scope

Work out what to review without asking when the answer is already known:

| Signal                                                                                                      | Scope                            |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------- |
| The request or the skill argument names a branch, a PR number, one or more paths, or says local/uncommitted | Use it                           |
| Uncommitted changes exist (`git status --porcelain` is non-empty) and nothing was named                     | Local uncommitted changes        |
| Feature branch with a clean tree                                                                            | Full branch diff against `dev`   |
| On `dev` or `master` with a clean tree                                                                      | Ask which branch or PR to review |

Ask only when the table gives no answer. Status line example: `Reviewing branch diff against dev (12 files)…`

## Step 2 — Collect the diff

Write the diff to a temp file and keep the changed-file list. Reviewers read the file; the diff is never pasted into their prompts. Noise files are excluded from every scope. Set `SCOPE` to `local`, `branch`, `pr` or `paths` from Step 1 and run only that branch of the `case`.

```bash
git fetch -q origin dev
EXCLUDE=(':!package-lock.json' ':!**/__snapshots__/**' ':!**/__screenshots__/**' ':!public/sw.js' ':!src/libs/lucide/lucideIcons.aliases.ts' ':!src/libs/lucide/lucideIcons.nodes.ts' ':!src/libs/lucide/lucideIcons.tags.ts')
OUT="${TMPDIR:-/tmp}/pubky-review-$(date +%s).diff"

case "$SCOPE" in
  local)   # tracked changes (staged + unstaged) plus untracked files
    git diff HEAD -- . "${EXCLUDE[@]}" > "$OUT"
    git ls-files --others --exclude-standard -- . "${EXCLUDE[@]}" | while read -r f; do git diff --no-index -- /dev/null "$f" >> "$OUT" || true; done   # --no-index exits 1 on a diff
    git status --porcelain -- . "${EXCLUDE[@]}"                       # changed-file list (?? = untracked)
    ;;
  branch)
    RANGE="origin/dev...HEAD"
    git diff "$RANGE" -- . "${EXCLUDE[@]}" > "$OUT"
    git diff --name-status "$RANGE" -- . "${EXCLUDE[@]}"              # changed-file list
    ;;
  pr)      # N = the PR number; works for same-repo and fork PRs
    BASE=$(gh pr view "$N" --json baseRefName --jq .baseRefName 2>/dev/null || echo dev)   # PRs target dev; gh may be absent
    git fetch -q origin "$BASE" "+pull/$N/head:refs/remotes/origin/pr-$N"   # + so a force-pushed PR head still updates
    RANGE="origin/$BASE...origin/pr-$N"
    git diff "$RANGE" -- . "${EXCLUDE[@]}" > "$OUT"
    git diff --name-status "$RANGE" -- . "${EXCLUDE[@]}"              # changed-file list
    ;;
  paths)   # PATHS = the files or directories named by the user; tracked changes plus untracked files under them
    git diff HEAD -- "${PATHS[@]}" "${EXCLUDE[@]}" > "$OUT"
    git ls-files --others --exclude-standard -- "${PATHS[@]}" "${EXCLUDE[@]}" | while read -r f; do git diff --no-index -- /dev/null "$f" >> "$OUT" || true; done
    git status --porcelain -- "${PATHS[@]}" "${EXCLUDE[@]}"           # changed-file list
    ;;
esac
```

If the diff is empty, say so and stop; the one exception is a named path with no diff, which is reviewed as it is.

## Step 3 — Callouts (deterministic, no judgement)

From the changed-file list and the added lines, record every hit. They go into the report's Callouts section and mirror `.github/PULL_REQUEST_TEMPLATE.md`:

- **VRT surface**: a changed file under `src/components/templates/**` or `src/components/organisms/**` whose component name appears in `src/test/vrt/**/*.vrt.test.tsx` (`grep -rl <Name> src/test/vrt`), or any change under `src/test/vrt/**` → baseline regeneration via the VRT Update Baselines workflow; local baselines must not be committed.
- **Dexie schema**: `src/core/database/franky/franky.ts`, `src/config/database.ts`, or `NEXT_PUBLIC_DB_VERSION` in `.env.example` → the local database is recreated for every user (ADR-0019); must be an explicit decision.
- **Product limits**: any changed constant under `src/config/**` → product-wide policy change.
- **Dependencies**: changed `dependencies` / `devDependencies` in `package.json` → check `docs/development-workflow.md` (Common AI Failure Modes) for an existing equivalent.
- **ADR**: files under `docs/adr/**`, or a diff that adds an Application → Application call, a coordinator, a store or a layer → ADR present or needed.
- **Generated or high-risk files**: `public/sw.js`, `src/libs/lucide/lucideIcons.{aliases,nodes,tags}.ts`, `.github/workflows/**`, `next.config.ts`, `src/sw.ts`, `src/instrumentation*.ts`, `src/sentry.*.config.ts`, `src/libs/network/network.ts`, `src/core/services/nextjs/og-metadata/**`.
- **i18n regression**: `next-intl`, `useTranslations`, `useFormatter`, `@/i18n`, `messages/` in added lines.
- **Cypress**: changes under `cypress/**` (owned by QA: flag, do not edit).
- **Docs**: a change that adds or alters a convention without touching `docs/` or `AGENTS.md`.

## Step 4 — Checks (when `node_modules` exists)

Run `npm run lint` and `npm run typecheck`; record pass/fail and the first error lines. Do not run the full unit suite or e2e; name the targeted test files the author should run instead.

## Step 5 — Dispatch three read-only reviewers

Launch all three in one message so they run in parallel, each as the harness's built-in read-only sub-agent (Claude Code: `subagent_type: "Explore"`; Cursor: its Explore sub-agent). A harness without sub-agents runs the three briefs one after another. Each reviewer gets the diff path, the changed-file list and its brief, and must not modify files.

Rules for every reviewer: read the actual source files to confirm each finding; never guess from the diff alone; never use "likely", "probably" or "appears to"; consult the doc or ADR a rule cites when a case is unclear.

Severity scale shared by all three: `critical` = security or user data loss; `high` = a rule violation that will produce a bug or crosses an architecture boundary; `medium` = a convention or maintainability problem; `low` = style or nit. Rules from `.greptile/config.json` keep their own `severity`.

Output from each reviewer: ONLY a JSON array, no markdown, `[]` when nothing was found. Finding shape:

```json
{
  "file": "src/core/controllers/post/post.ts",
  "line": 42,
  "rule": "no-service-from-controller",
  "severity": "high",
  "what": "PostController imports LocalPostService directly, bypassing the Application layer",
  "why": "Layer boundary (docs/architecture.md, ADR-0004): controllers reach IO only through Application",
  "fix": "Replace LocalPostService.create(post) with PostApplication.commitCreate({ compositePostId, post, postUrl })"
}
```

`rule` is the `.greptile/config.json` id when one applies, otherwise a category (`security`, `error-handling`, `type-safety`, `tests`, `simplification`).

### Reviewer 1 — Architecture and project rules

Read `AGENTS.md` (Architecture, Non-negotiables) and every rule in `.greptile/config.json`. Apply each rule only to changed files matching its `scope`, using its `id` and `severity`. Verify layer boundaries by reading the import paths and call sites of the changed files, and the ADR-0009 allow-list for any Application → Application call.

### Reviewer 2 — Quality outside the rule set

Review only what the project rules do not cover: (1) security: hardcoded secrets or tokens, unsafe input handling, XSS vectors (`dangerouslySetInnerHTML`, unescaped user content), SSRF exposure in server code; (2) unhandled promise rejections, swallowed errors (empty `catch`), fire-and-forget async calls in event handlers without a catch; (3) type safety: unnecessary `any`, `as unknown as X`, missing null/undefined checks before property access; (4) missing tests: functions with 3+ branches or async error paths in `src/core/` or `src/components/` with no co-located test, with 1–2 concrete cases to add; (5) tests that mock what should stay real (Lucide, `@/icons`, Radix) or coerce with `as any` / `as unknown as T` instead of the `src/test-utils` helpers. Do not report architecture-rule violations, style, import order, or accessibility of Radix/Shadcn primitives.

### Reviewer 3 — Simplification

One question per changed function, component or block: could this be simpler? (1) over-abstraction and premature generalisation; (2) control flow: nested if/else that could be early returns, ternaries that should be if statements; (3) duplication within the diff; (4) existing utilities ignored: `cn()`, timestamp helpers, `truncateString`, `truncateMiddle`, `formatPublicKey`, `formatFileName`, `toAppError`, `safeFetch`, route builders in `@/app/routes`, existing atoms, molecules and hooks (check `src/libs/`, `src/components/`, `src/hooks/` first); (5) components mixing concerns that belong in a hook, controller or pipe. Read the surrounding code before flagging. Do not report architecture, security or type-safety issues.

## Step 6 — Synthesize

1. Deduplicate by `file:line`, keeping the most specific finding.
2. Rank critical > high > medium > low; cap at 8 findings and state the total.
3. Verdict: **Needs work** for any critical or high finding or a failed check; **Needs attention** for 2+ medium; otherwise **Ready to merge**. Callouts never change the verdict but are always listed.
4. Delete the temp diff file.

## Step 7 — Report

```
## Code Review: <scope>

### Checks
lint: pass | fail (first error) · typecheck: pass | fail · or "skipped: no node_modules"

### Callouts
- VRT: <files> → dispatch VRT Update Baselines (or "none")
- Schema / limits / dependencies / ADR / generated / i18n / cypress / docs: … (or "none")

### Findings (N total, showing top M)

#### [1] severity | rule-or-category | file:line
**What**: … **Why**: … (doc or ADR) **Fix**: concrete change

### Verdict
**Ready to merge** | **Needs attention** | **Needs work** — one sentence.

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 0     |
| Low      | 0     |
```

Add a one-line "Done well" only when there is something specific to name with a file reference, never as filler. If no reviewer found anything, say so plainly; do not invent issues.
