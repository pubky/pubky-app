# Pubky App

Decentralized social app: Next.js 16 App Router, React 19 with the React Compiler, TypeScript, Tailwind v4 + Shadcn UI, Zustand,
Dexie (IndexedDB), TanStack Query. Package name `franky`. Local-first: writes go to Dexie first and sync to the homeserver;
reads come from Dexie and fall back to Nexus. This file is the entry point for every AI agent (Claude Code, Codex, Cursor);
it indexes `docs/`, which is canonical and wins over anything here (`docs/development-workflow.md` is the long version).

## Commands

Node 24 (`.nvmrc`), dependencies via `npm ci`. The pre-commit hook runs `lint-staged` then `npm run typecheck`.

| Task                    | Command                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Dev server (port 3000)  | `npm run dev` (staging defaults are built in, no `.env` needed)                                |
| Format, lint, types     | `npm run format:check`, `npm run lint`, `npm run typecheck`                                    |
| Unit tests (jsdom)      | `npm test` (~13k tests, minutes); one file `npm test -- <path>`; one name `npm test -- -t "x"` |
| Snapshots               | `npm run test:update-snapshots`                                                                |
| Visual regression (VRT) | `npm run test:vrt` (`npm run test:vrt:setup` once); baselines are CI-owned, never commit local |
| Production build        | `npm run build` (`next build --webpack`)                                                       |
| E2E (Cypress)           | `npm run test:e2e`; needs the full pubky-stack, not runnable from a bare checkout              |

## Architecture (`src/core`)

```
UI (user actions) → Controllers → Application → Services → Models
Coordinators (system) ↗            ↓              ↓
                       Stores     Pipes         Database
```

Hard constraints (review-enforced, not compiler-enforced; `docs/architecture.md`):

- Controllers NEVER call Services directly and never do IO; they go through Application.
- Coordinators NEVER call Application; they go through Controllers.
- Application NEVER accesses Stores and never calls Controllers; only Controllers manage stores.
- Pipes are pure: NO IO, NO side effects. Services never call up. Models touch Dexie only.
- Cross-Application calls (ADR-0009): only PostApplication, NotificationApplication, BootstrapApplication, MigrationApplication,
  HotApplication, PostStreamApplication and TtlApplication may call other Applications; acyclic; depth 1, with one depth-2
  exception: PostApplication | NotificationApplication | TtlApplication → PostStreamApplication → FileApplication.

Imports use the `tsconfig.json` aliases and point at concrete files: `@/atoms/Button/Button`, `@/hooks/*`, `@/controllers/*`,
`@/application/*`, `@/services/*`, `@/models/*`, `@/pipes/*`, `@/stores/*`, `@/config/<module>`, `@/app/routes`, `@/icons`,
`@/libs/*`. No re-export `index.ts` barrels, no `src/config/index.ts`.

Controller naming encodes IO: `fetch*` network only, `get*` local only, `getMany*` bulk local returning `Map<Pubky, T>`,
`getOrFetch*` local then network, `getMany*OrFetch` bulk variant, `subscribe*` long-lived stream,
`commitCreate* | commitUpdate* | commitDelete*` local-first write + sync.

## Non-negotiables

- Errors: `Err.*` factories (`src/libs/error/error.factories.ts`), never raw `Error`. Factories log and capture, so never
  log-then-throw. `docs/error-handling.md`
- Local-first reads in hooks: `useLocalFirstQuery` (`@/hooks/useLocalFirstQuery/useLocalFirstQuery`). Never network, TanStack
  or retry logic inside `useLiveQuery`; no hand-rolled `useEffect` + `useLiveQuery`. A cache hit is never refreshed by it,
  a tombstone counts as data, a settled `null` means missing. `docs/local-first.md`
- Local-first writes: Dexie first, homeserver sync after, roll back on failure, refresh every affected `*_ttl` row, persist
  dependencies before dependents; stream cursors only from Nexus, never `indexed_at`. `docs/local-first.md`, `docs/data-patterns.md`
- Composite post ids `author:postId` via `buildCompositeId` / `parseCompositeId`. `docs/data-patterns.md`
- Shadcn first and design tokens only (`bg-primary`, not `bg-[#1a1a1a]` or `p-[13px]`); atomic tiers atoms → molecules →
  organisms → templates; z-index only `-z-10, z-10, z-30, z-40, z-50, z-60`. `docs/components.md`, `docs/z-index.md`
- No `useCallback` / `useMemo` / `React.memo`: the React Compiler handles it. Add one only with profiler evidence.
- Icons: stock from `lucide-react`, custom from `@/icons`, URL helpers from `@/libs/utils/urlToIcon`. `docs/components.md`
- Toasts: `toast()` from `@/molecules/Toaster/toast` with `variant`; internals are ESLint-blocked; copy is static, never
  interpolate user-entered text. `docs/components.md`
- Forms: react-hook-form + zod inside a `use{Action}Form` hook returning `{ form, submit }`; schema in a sibling `*.types.ts`;
  form components never call `commit*` controllers directly; Zod v4 (`z.url()`). `docs/components.md`
- Dexie schema: one `DB_VERSION`; a mismatch recreates the database. Bumping it or changing an index map is a reviewed
  decision, never a side effect. `docs/data-patterns.md`, ADR-0019
- Copy: inline US-English literals at the call site. i18n (`next-intl`, `messages/`, `useTranslations`) was removed in #2313
  and must not come back in any form, including a lookalike message registry.
- `src/config/*` limits are product-wide policy: never tune one for a local fix, and never reduce visible behaviour
  (counts, actions, states, routes) to fix a bug.
- Generated files are hands-off: `public/sw.js`, `src/libs/lucide/lucideIcons.{aliases,nodes,tags}.ts`, `package-lock.json`.
  CI workflows change only in a CI task.
- Env: only `src/libs/env/env.ts` and `src/libs/runtime-config/**` read `process.env.NEXT_PUBLIC_*` / `PUBKY_RUNTIME_*`
  (ESLint-enforced); deploy-time values are `PUBKY_RUNTIME_*` getters, never secrets. `docs/environment.md`
- Sentry: throw via `Err.*`; `Sentry.captureException` is called only in `app/error.tsx` and `app/global-error.tsx`, for
  non-`AppError` values; no raw user data in error context. `docs/sentry.md`
- Tests: colocated `*.test.tsx`, one snapshot per test, mobile snapshot blocks for viewport-aware organisms; no `as any` or
  `as unknown as T` (use the `src/test-utils` helpers). `docs/component-testing.md`

## Before you edit, read

- `src/core/**` → `docs/architecture.md`, `docs/local-first.md`, `docs/data-patterns.md`, `docs/error-handling.md`
- `src/hooks/**` → `docs/local-first.md`, `docs/data-patterns.md`, `docs/components.md` (Forms)
- `src/components/**`, `src/app/**` → `docs/components.md`, `docs/z-index.md`, `docs/skeleton-architecture.md`,
  `docs/component-testing.md`
- `src/test/vrt/**` → `docs/visual-regression-testing.md`
- `src/libs/env/**`, `src/libs/runtime-config/**`, `src/config/**` → `docs/environment.md`
- `src/libs/observability/**`, `src/instrumentation*.ts`, `src/sentry.*.config.ts` → `docs/sentry.md`
- `src/core/database/**`, `src/core/services/homeserver/**`, `src/core/pipes/**`, `src/libs/network/**` →
  `docs/architecture.md`, _High-Risk Areas_, first
- Any change → `docs/development-workflow.md`; the ADRs in `docs/adr/` explain the why

## How to work here

1. Restate the request as behaviour, find the nearest feature that already does it, trace it end to end, and name one file
   per layer you will touch.
2. Reuse before creating: search `src/components`, `src/hooks`, `src/libs`, `src/core/utils` and `src/config` for the
   primitive, hook, helper or constant first.
3. Make the smallest coherent change. No drive-by refactors, renames, reformatting, dependency swaps or pattern migrations
   in the same PR.
4. Verify at the right level: component change → its colocated test + `lint` + `typecheck`; core change → the affected
   package tests + `typecheck` + `lint`; runtime-config/env change → `npm test -- src/libs/runtime-config`; VRT surface →
   `npm run test:vrt` and flag the baseline; cross-cutting → full `npm test`, plus `npm run build` when route- or config-wide.
5. Read your own diff for drift: a stray `useMemo`, a hex colour, a new `index.ts`, an unrelated rename, a raw `Error`,
   a direct `process.env` read.
6. Raise, do not decide: a `DB_VERSION` bump, a `src/config` limit change, a new architectural pattern (needs an ADR) or a
   VRT baseline change are product decisions to surface to the user.

Definition of done: correct layer only; naming conventions; existing primitives reused and no new dependency without a
reason; `Err.*` everywhere and nothing double-logs; no new colours, spacing, z-index or memo; read pitfalls and TTL refresh
considered; no visible behaviour reduced; concrete imports and no barrels; tests at the right level including mobile
snapshots; `lint`, `typecheck` and targeted tests pass; VRT, ADR, `DB_VERSION` and config changes called out; the diff
reads like the surrounding code.

Commits and branches: `type(scope): description` (imperative, lower-case, no period, ≤72 chars); branches
`<type>/<issue>-<kebab-description>` cut from `dev`; PRs target `dev`, draft unless asked, one change per PR. Cypress specs
are owned by QA: flag an invalidated spec, do not edit or run e2e yourself. `docs/commit-message.md`

## Common failure modes

- IO in a component, hook or pipe; a service called from a controller; application called from a coordinator.
- A new store, a second data-fetching mechanism or a parallel error type instead of Zustand, TanStack or `Err.*`.
- A new button, dialog, input, empty state or skeleton where an atom, molecule or Shadcn primitive already exists.
- A `useEffect` where `useLocalFirstQuery` belongs; a cache hit treated as fresh data; a second freshness mechanism beside TTL.
- User text interpolated into toast copy; toasts styled by `className`.
- A dependency added for something already in the tree (`dexie`, `zustand`, `@tanstack/react-query`, `react-hook-form`,
  `zod`, `radix-ui`, `motion`, `lodash-es`, `usehooks-ts`, `jszip`, `@synonymdev/pubky`, `pubky-app-specs`, …).
- A feature task turned into a refactor, or a route page rewritten with a new layout instead of composing the template.

## Cursor Cloud specific instructions

- Nothing external needs to be started: the app uses IndexedDB and the Next.js dev server, with staging defaults for Nexus,
  Homeserver, CDN, relays and Homegate baked into `src/libs/runtime-config/runtime-config.schema.ts`.
- Sign in with the staging account: `npm run dev`, open `http://localhost:3000`, **Sign In** → **Use recovery phrase**,
  enter the 12 words from the `STAGING_RECOVERY_PHRASE` secret, **Restore**.
- Account creation needs SMS verification or a Bitcoin payment against staging infrastructure; do not try it in the VM.
- Unit tests need no browser (`fake-indexeddb` + jsdom); `npm run test:e2e` needs external staging services, skip it.

## Tooling map

- `CLAUDE.md` imports this file for Claude Code; Codex and Cursor read it directly. Keep it within 150 lines; details go
  in `docs/`.
- `.cursor/rules/*.mdc` and `.claude/rules/*.md` attach the matching doc when a file under their glob is edited; their
  bodies only point at `docs/`.
- Skills live in `.agents/skills/<name>/` (read natively by Codex and Cursor, symlinked from `.claude/skills/` for Claude
  Code): `pubky-code-review`, `pubky-staging-invite`, `sentry-nextjs-sdk`.
- Greptile reads `.greptile/config.json` (rules) and `.greptile/files.json` (which docs to attach per path), nothing else.
- Update `docs/` first (plus an ADR when an architectural rule changes), then the one-line summary here, then Greptile.
  The adapters only point, so they rarely change.
