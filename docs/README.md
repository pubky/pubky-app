# Documentation

Single source of truth for all project standards, conventions, and architectural decisions. `AGENTS.md` in the repo root is the entry point for AI coding agents and for humans in a hurry; it indexes this folder and never restates it.

## Quick Reference

| Working on...                                                                                                                         | Read these docs                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Anything                                                                                                                              | `../AGENTS.md`, `development-workflow.md`                                         |
| `src/core/`                                                                                                                           | `architecture.md`, `local-first.md`, `error-handling.md`, `data-patterns.md`      |
| `src/hooks/`                                                                                                                          | `local-first.md`, `data-patterns.md`                                              |
| `src/components/`                                                                                                                     | `components.md`, `skeleton-architecture.md`, `z-index.md`, `component-testing.md` |
| `src/libs/env/`, `src/libs/runtime-config/`                                                                                           | `environment.md`                                                                  |
| Sentry / observability                                                                                                                | `sentry.md`                                                                       |
| PWA: `src/sw.ts`, `public/manifest.json`, `src/libs/pwa/`, `src/hooks/use{ServiceWorkerUpdate,NetworkStatus,AppBadge,InstallPrompt}*` | `pwa.md`                                                                          |
| Writing tests                                                                                                                         | `component-testing.md`, `visual-regression-testing.md`                            |
| Making commits, branches, PRs                                                                                                         | `commit-message.md`                                                               |
| Cutting a release                                                                                                                     | `release.md`                                                                      |
| Cutting a hotfix                                                                                                                      | `hotfix.md`                                                                       |
| Architectural decisions                                                                                                               | `adr-guidelines.md`, `adr/`                                                       |

## Documentation Files

| File                           | Description                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `development-workflow.md`      | How to approach a change, patterns to reuse, verification ladder, code quality, failure modes, definition of done  |
| `architecture.md`              | Core layered architecture, dependency rules, anti-patterns, high-risk areas, ADR index                             |
| `local-first.md`               | Local-first writes, controller naming, `useLocalFirstQuery` reads and their pitfalls, deferred stream invalidation |
| `data-patterns.md`             | Composite IDs, streams, TTL, pipes normalization, Dexie tables and schema changes                                  |
| `error-handling.md`            | Error conventions using AppError and Err.\* factories                                                              |
| `components.md`                | Component patterns, Shadcn, atomic design, Figma, icon imports, toasts, forms                                      |
| `component-testing.md`         | Unit test and snapshot test rules                                                                                  |
| `visual-regression-testing.md` | VRT tests, determinism, CI-owned baselines                                                                         |
| `skeleton-architecture.md`     | Skeleton loader placement, naming, and testing patterns                                                            |
| `z-index.md`                   | Z-index layering conventions                                                                                       |
| `sentry.md`                    | What is captured, capture rule, drop rules, privacy scrubbing, source maps                                         |
| `environment.md`               | Build-time `Env` and runtime `PUBKY_RUNTIME_*` configuration                                                       |
| `pwa.md`                       | Service worker scope, update flow, offline fallback, precache allow-list, manifest, install banner, local testing  |
| `commit-message.md`            | Conventional commit format, branch naming, pull request conventions                                                |
| `release.md`                   | Cutting a production release from `dev` onto `master`                                                              |
| `hotfix.md`                    | Cutting a production patch without taking `dev` HEAD (see `release.md` for shared steps)                           |
| `adr-guidelines.md`            | When and how to write ADRs                                                                                         |

### Migrations

| File                                     | Description                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `migrations/2305-i18n-conflict-guide.md` | Resolving branch conflicts against the i18n removal (delete after the open-PR wave clears) |

## Architecture Decision Records

Stored in `adr/`. See `architecture.md` for the full index.

## AI Coding Agents

The repo is set up so that Claude Code, Codex and Cursor all read the same instructions, and so that no rule is written twice:

| Layer                | Files                                                                         | Role                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Entry point          | `../AGENTS.md` (Codex and Cursor read it natively; `../CLAUDE.md` imports it) | Commands, hard rules, doc index, verification, definition of done                                       |
| Conventions          | this folder                                                                   | Canonical long-form rules                                                                               |
| Path-scoped adapters | `../.cursor/rules/*.mdc`, `../.claude/rules/*.md`                             | Attach the matching doc when a file under the glob is edited; body is a pointer only                    |
| Skills               | `../.agents/skills/<name>/` (symlinked from `../.claude/skills/`)             | On-demand procedures: `pubky-code-review`, `pubky-staging-invite`, `sentry-nextjs-sdk`                  |
| PR review            | `../.greptile/config.json`, `../.greptile/files.json`                         | Greptile rules and the docs it reads per path (it does not read `AGENTS.md` or the adapters on its own) |
| Permissions          | `../.claude/settings.json`                                                    | Claude Code permission allowlist for the verification commands                                          |
| Dev server           | `../.claude/launch.json`                                                      | Claude Code launch config: `npm run dev` on port 3000, `autoPort` picks a free port on conflict         |

The Cursor commit rule (`../.cursor/rules/commit-message.mdc`) is agent-requested rather than path-scoped and intentionally has no Claude twin: Claude Code has no agent-requested rule type, and `../AGENTS.md` already points commits, branches and PRs at `commit-message.md`.

When a convention changes: update the doc here (plus an ADR when the rule is architectural), then `AGENTS.md` if the one-line summary changed, then `.greptile/config.json` if Greptile should enforce it. The adapters only point at docs, so they rarely need a change beyond a new glob.

## Keeping Documentation Updated

When making significant changes to:

- **Core architecture**: Update `architecture.md` + create ADR
- **Local-first reads/writes or TTL**: Update `local-first.md`, `data-patterns.md`
- **Component patterns** (layout, Shadcn, icon imports, toasts, forms): Update `components.md`
- **Skeleton loaders**: Update `skeleton-architecture.md`
- **Error handling**: Update `error-handling.md`
- **Testing patterns**: Update `component-testing.md`, `visual-regression-testing.md`
- **Environment or runtime variables**: Update `environment.md`
- **Observability**: Update `sentry.md`
- **Service worker, manifest or installed-app behaviour**: Update `pwa.md`
- **Commit, branch or PR conventions**: Update `commit-message.md`
- **Release process**: Update `release.md`
- **Hotfix process**: Update `hotfix.md`
- **Agent workflow, verification, definition of done**: Update `development-workflow.md` and the summary in `AGENTS.md`
