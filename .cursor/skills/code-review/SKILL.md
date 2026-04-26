---
name: code-review
description: Run a local code review against project architecture rules and quality standards. Use when the user asks to review code, check for violations, or audit changes.
---

# Local Code Review

Review code changes against project standards using parallel focused reviewers.

## Presentation

Do NOT narrate your steps, show tool outputs, or explain what you are reading.
After the user picks an option, immediately output this single message and nothing else until the review is ready:

> **Robots are reviewing your code...**

Then silently perform steps 2-5 using tool calls. Do not output any text between the waiting message and the final report. When the review is complete, replace the status with the full report from step 6.

## Step 1 — Ask the user

Before doing anything, ask:

> **What do you want to review?**
>
> 1. Local uncommitted changes
> 2. Full branch diff against `dev`
> 3. Specific files (provide paths)

Wait for the answer. If the user picks 3, ask them for the file paths.

## Step 2 — Get the diff

- If **1**: run `git diff` and `git diff --staged`
- If **2**: run `git diff origin/dev...HEAD`
- If **3**: run `git diff -- <paths>` and read the specified files

Store the full diff text — you will pass it to sub-agents.

## Step 3 — Load project context

Read these files (you will pass their contents to the Architecture agent):

1. `.greptile/config.json` — structured rule list with scopes and severities
2. `.greptile/rules.md` — detailed explanations and examples

## Step 4 — Dispatch parallel review agents

Launch **three** Task sub-agents in parallel (all with `readonly: true`). Each agent receives the diff and a focused brief. Send all three in a single message so they run concurrently.

### Agent 1: Architecture (project-specific)

Use `subagent_type: "code-reviewer"`.

Prompt template (fill in `{diff}`, `{config_json}`, `{rules_md}`):

```
You are reviewing code changes against this project's architecture rules.

## Rules

{config_json}

## Rule Details

{rules_md}

## Diff to review

{diff}

## Instructions

Check every changed file against the rules above. For each rule, check if the diff introduces a violation within that rule's scope.

VERIFICATION IS MANDATORY. For every potential issue:
- Read the actual source file to confirm the violation exists
- If a rule references a layer boundary, verify import paths and call sites in the file
- If flagging an unused export, search the codebase to confirm it is truly unused
- If flagging dead code, verify the condition is actually always true/false

Never report anything you have not confirmed in source. Never use "likely", "probably", or "appears to".

For deeper context, consult the relevant docs/ file (see docs/README.md for the index) and docs/adr/ for Architecture Decision Records.

## Output format

Return ONLY a JSON array. No markdown, no explanation outside the array.

Each finding:
{
  "file": "path/to/file.ts",
  "line": 42,
  "rule_id": "no-service-from-controller",
  "severity": "high",
  "what": "PostController imports LocalPostService directly, bypassing Application layer",
  "why": "Violates layer boundary (docs/architecture.md, ADR-0004). Controllers must go through Application for all IO.",
  "fix": "Replace LocalPostService.create(post) with PostApplication.commitCreate({ compositePostId, post, ... })"
}

If no violations found, return an empty array: []
```

### Agent 2: General Quality

Use `subagent_type: "code-reviewer"`.

Prompt template (fill in `{diff}`):

```
You are reviewing code changes for general quality issues NOT covered by project-specific architecture rules.

## Diff to review

{diff}

## Focus areas

Review ONLY for these categories:

1. **Security**: hardcoded secrets/tokens, unsafe input handling, XSS vectors in JSX (dangerouslySetInnerHTML), unescaped user content in HTML
2. **Error handling gaps**: raw `throw new Error()` in src/core/ production code (should use `Err.*` factories — they log automatically), unhandled promise rejections (missing catch/try-catch on async calls), swallowed errors (empty catch blocks), logging before throwing `Err.*` (causes double-logging)
3. **Type safety**: unnecessary `any` types, missing null/undefined checks before property access, type assertions that hide bugs (`as unknown as X`)
4. **Dexie/React misuse**: network calls or TanStack Query usage inside `useLiveQuery` callbacks (breaks Dexie PSD — see docs/local-first.md, ADR-0011), direct `process.env` access instead of the validated `Env` object from `@/libs/env/env`
5. **Hardcoded design values**: hardcoded hex/rgb colors in Tailwind classes (`bg-[#1a1a1a]`) instead of design tokens (`bg-primary`), arbitrary z-index values (`z-[999]`) instead of the standard scale (-z-10, z-10, z-30, z-40, z-50, z-60)
6. **Naming**: controller methods not following fetch*/get*/getOrFetch*/commitCreate*/commitUpdate*/commitDelete* conventions, functions whose names don't match what they actually do
7. **Missing tests**: complex functions (3+ branches or async with error paths) in src/core/ or src/components/ that have no co-located .test.tsx/.test.ts file — suggest 1-2 specific test cases

VERIFICATION IS MANDATORY. Read the actual source file to confirm every finding. Do not guess from the diff alone. Never use "likely" or "probably".

Do NOT flag:
- Style/formatting preferences
- Import ordering
- Architecture layer violations (another reviewer handles those)
- Accessibility on Radix/Shadcn primitives (they handle aria and keyboard support automatically)

## Output format

Return ONLY a JSON array. No markdown, no explanation outside the array.

Each finding:
{
  "file": "src/core/services/local/post/post.ts",
  "line": 42,
  "category": "error-handling",
  "severity": "medium",
  "what": "Raw throw new Error('Failed to save') instead of Err.database()",
  "why": "Err.* factories log automatically and provide structured error context (service, operation, cause). Raw Error bypasses this.",
  "fix": "throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to save post', { service: ErrorService.Local, operation: 'create', cause: error })"
}

If no issues found, return an empty array: []
```

### Agent 3: Simplification

Use `subagent_type: "code-reviewer"`.

Prompt template (fill in `{diff}`):

```
You are reviewing code changes with one question: "Could this be simpler?"

## Diff to review

{diff}

## Focus areas

For each changed function, component, or block, ask whether it could be written more simply:

1. **Over-abstraction**: wrapper functions/components that add a layer without adding value, premature generalization for a single use case
2. **Control flow**: nested if/else that could be early returns, complex ternaries that should be if statements, switch statements with fallthrough that obscure intent
3. **Duplication within the diff**: similar logic repeated across changed files that could share a utility
4. **Existing utilities ignored**: code that reimplements something already available in `src/libs/` — this project has `cn()` (clsx+tailwind-merge), timestamp helpers (`minutesAgo`, `hoursAgo`, `daysAgo`), string utilities (`truncateString`, `truncateMiddle`, `formatPublicKey`, `formatFileName`), and error utilities (`toAppError`, `safeFetch`). Check `src/libs/` before flagging.
5. **Component complexity**: React components mixing concerns that should be separated per the architecture — e.g., a component calling services directly instead of using controllers, or doing data transformation that belongs in a Pipe

VERIFICATION IS MANDATORY. Read the actual source file for full context before flagging. A function may look complex in a diff but be justified by surrounding code. Never use "likely" or "probably".

Do NOT flag:
- Architecture violations (another reviewer handles those)
- Security or type safety issues (another reviewer handles those)
- Minor style preferences

## Output format

Return ONLY a JSON array. No markdown, no explanation outside the array.

Each finding:
{
  "file": "src/components/organisms/PostFeed/PostFeed.tsx",
  "line": 42,
  "category": "simplification",
  "severity": "medium",
  "what": "Component manually truncates display text instead of using truncateString() from src/libs/",
  "why": "Duplicates existing utility and diverges from truncation behavior used elsewhere in the app",
  "fix": "import { truncateString } from '@/libs/utils/utils' and replace the manual truncation"
}

If nothing to simplify, return an empty array: []
```

## Step 5 — Synthesize and prioritize

Collect the JSON arrays from all three agents. Then:

1. **Deduplicate**: if multiple agents flagged the same file:line, keep the most specific finding
2. **Rank** all findings: critical > high > medium > low
3. **Cap at 8 findings** — if more than 8, keep only the top 8 by severity. Mention the total count.
4. **Identify 1-3 strengths** — scan the diff for things done well: clean naming, good error handling, proper layer separation, thorough types, well-structured components. Be specific with file references.
5. **Determine verdict**:
   - **Ready to merge**: 0 high/critical findings
   - **Needs attention**: 0 high/critical but 2+ medium findings worth discussing
   - **Needs work**: any high or critical finding

## Step 6 — Report

Output the review in this exact format:

```
## Code Review: [branch name or scope description]

### What's done well
- [Strength 1 with file reference]
- [Strength 2 with file reference]
- [Strength 3 with file reference — optional]

### Findings (N total, showing top M)

#### [1] severity | rule-id-or-category | file:line
**What's wrong**: ...
**Why it matters**: ... (reference docs/architecture.md, ADR, etc. where applicable)
**Fix**: [concrete code change or instruction — not just a warning]

#### [2] ...

(max 8 findings, grouped by severity — highest first)

### Verdict

**Ready to merge** | **Needs attention** | **Needs work**

[One sentence explaining the verdict]

### Summary
| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 0     |
| Medium   | 0     |
| Low      | 0     |
```

If no findings from any agent, report that clearly. Don't invent issues.
