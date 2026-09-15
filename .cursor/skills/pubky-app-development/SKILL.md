---
name: pubky-app-development
description: Project-native guidance for changing pubky/pubky-app: layered core architecture, atomic design + Shadcn UI, local-first Dexie writes, router/hook patterns, verification commands, and the boundaries an AI session must not cross.
---

# pubky-app Development

## Purpose

Make a change to `pubky/pubky-app` that a maintainer would write: right layer, right primitive,
smallest coherent diff, verified with the project's own commands. This skill is the operating
manual; `docs/` in the repo is the canonical source and wins over anything here.

## Golden Rules

1. Read the matching doc before editing: `src/core/**` → `docs/architecture.md`, `docs/local-first.md`,
   `docs/data-patterns.md`, `docs/error-handling.md`; `src/components/**` → `docs/components.md`,
   `docs/z-index.md`, `docs/skeleton-architecture.md`, `docs/component-testing.md`;
   `src/test/vrt/**` → `docs/visual-regression-testing.md`; `src/libs/env|runtime-config` →
   `docs/environment.md`.
2. Find the closest existing analogue and copy it. Before creating any component, hook, service,
   pipe, util, constant or type, grep the repo for a semantic equivalent first.
3. Respect the layer chain: `UI/Coordinators → Controllers → Application → Services → Models`
   (Stores for UI state, Pipes for pure transforms). Never skip a layer "just this once".
4. Views never talk to the network or Dexie. A component calls a hook; the hook calls a controller;
   only controllers → application → services reach IO.
5. Every error is an `AppError` from `Err.*` factories (`src/libs/error/error.factories.ts`).
   No `throw new Error(...)`, no plain strings, and never log then re-wrap (factories log).
6. Shadcn first, tokens always. Check for a Shadcn component / existing atom before writing custom
   markup, and use design tokens (`bg-primary`, `text-muted-foreground`) instead of hex or arbitrary
   values (`bg-[#1a1a1a]`, `p-[13px]`, `h-[37px]`).
7. Do not add `useCallback` / `useMemo` / `React.memo`: the React Compiler is enabled
   (`reactCompiler: true` in `next.config.ts`).
8. Writes are local-first: Dexie first, homeserver sync after, UI updated immediately.
9. Imports point at concrete modules through the `tsconfig.json` path aliases. No `index.ts`
   re-export barrels under `src/components`, no aggregate `src/config/index.ts`.
10. Change only what the request needs. No drive-by refactors, renames, reformatting, dependency
    swaps or pattern migrations in the same PR.
11. If you changed a surface covered by a VRT (`src/test/vrt/<area>/*.vrt.test.tsx`), tell the user the
    baseline under that area's `__screenshots__/` needs regenerating via the **VRT Update Baselines**
    workflow (dispatched from `dev` or the feature branch). Do not commit baselines produced by
    `npm run test:vrt:regenerate-baseline`: pixel rendering differs between a dev machine and the CI
    runners, so CI owns the baselines (`docs/visual-regression-testing.md`). PR CI does not run VRT.
12. Never edit generated files by hand: `public/sw.js` (built from `src/sw.ts`), the generated
    `src/libs/lucide/lucideIcons.{aliases,nodes,tags}.ts` (plain `lucideIcons.ts` is hand-written),
    `package-lock.json` (let npm write it). CI workflows are hand-maintained but high-risk: change
    them only when the task is CI.
13. Copy is inline US-English literals at the call site. `next-intl`, `messages/`, `src/i18n/`,
    `useTranslations`, `useFormatter`, `t.rich` were removed (PR #2306 then #2313) and must not come
    back, including as a lookalike "message registry". Duplicated copy across components is accepted.
14. Never reduce visible behaviour to fix a bug (counts, actions, states, routes, responsive
    behaviour), and never edit a `src/config/*` limit to make one component pass: those constants are
    product-wide policy. If the policy itself must change, say so in the PR body.

## System Map

Single Next.js App Router app (package name `franky`), Node 24 (`.nvmrc`), Next 16.3, React 19.2,
Tailwind v4, Zustand, Dexie + `dexie-react-hooks`, TanStack Query 5, react-hook-form + Zod 4 (use
`z.url()`, not the deprecated `z.string().url()`). Dependencies are installed with npm; CI uses `npm ci`.

| Area | Path | Owns |
| --- | --- | --- |
| Routes / pages | `src/app/**`, `src/app/routes.ts` | App Router pages, layouts, route enums and URL builders, `robots.ts`, `api/` route handlers |
| UI | `src/components/{atoms,molecules,organisms,templates}/` | Atomic design tiers; page bodies live in `templates/`, wired by thin route files |
| Hooks | `src/hooks/` (~140 hooks) | Controller-calling view hooks, form hooks, viewport/scroll hooks |
| Core | `src/core/` | The layered domain: controllers, coordinators, application, services, models, pipes, stores, database, utils |
| Libs | `src/libs/` | Framework-adjacent, layer-agnostic infrastructure: `api`, `http`, `network`, `error`, `logger`, `env`, `runtime-config`, `identity`, `password`, `phone`, `image`, `file`, `post`, `icons`, `lucide`, `svg`, `og`, `html`, `motion`, `search`, `share`, `status`, `deeplink`, `observability`, `query-client`, `mute-sync`, `utils`, `vibes` |
| Config | `src/config/*` | Concrete config modules (`app`, `network`, `nexus`, `posts`, `collections`, `feed`, `tags`, `sync`, `search`, `ui`, `theme`, `layoutClasses`, `layoutDimensions`, `forms`, `images`, `moderation`, `metadata`, `urls`, `user`, `logs`, …) |
| Docs | `docs/`, `docs/adr/0001..0019` | Canonical conventions; ADRs hold the *why*, and `docs/README.md` maps topic → doc |
| Tests | colocated `*.test.ts(x)`, `src/test/vrt/<area>/*.vrt.test.tsx` + `__screenshots__/`, `src/test-utils/`, `src/test/fixtures|mocks/`, `cypress/` | Unit, snapshot, VRT, e2e |

Responsibilities by layer (`src/core/`):

- `controllers/` - entry point for user intent (UI) - the only place UI talks to core.
- `coordinators/` - entry point for system events (auth, visibility, timers, route change, streams, TTL, mute-list sync).
- `application/` - orchestration of a business workflow; the only core caller of services.
- `services/local|homeserver|nexus|nextjs|homegate|chatwoot|exchangerate` - the IO boundary.
- `models/` - Dexie tables and CRUD; `database/franky/franky.ts` - the single schema definition (recreated, not migrated).
- `pipes/` - pure normalize/validate + `pubky-app-specs` builders (`PubkySpecsSingleton`).
- `stores/` - Zustand global UI state only.

## Architectural Boundaries

Dependency direction, enforced by review plus docs (`docs/architecture.md`, ADR-0004/0008/0009):

- Controllers → Pipes, Application, Stores. Controllers NEVER call services, NEVER do IO.
- Application → Pipes, Services. Application NEVER touches stores, NEVER calls controllers.
- Services: `local → Models`; `homeserver` and `nexus` are network only; services never call up.
- Models → Dexie only. Pipes → no IO at all.
- Coordinators react to system events and call controllers - never application, never services.

Per layer, in the terms a reviewer will use:

| Layer | May | May not |
| --- | --- | --- |
| `controllers/` | normalize with pipes, call application, read/write stores, translate user intent | call services, do IO, be UI-aware |
| `coordinators/` | react to auth/route/visibility/timer/stream events and call controllers | call application or services directly |
| `application/` | orchestrate services and pipes, order dependent writes, approved cross-application calls | touch stores, call controllers, import React |
| `services/` | network and Dexie IO behind `local`, `homeserver`, `nexus`, `nextjs`, … | call up into application or controllers, read stores |
| `models/` | table CRUD and row shapes for Dexie | network IO, store access |
| `pipes/` | pure normalize/validate/transform, `pubky-app-specs` builders | fetch, Dexie, stores, logging side effects |

Cross-domain calls (ADR-0009) are restricted to `PostApplication`, `NotificationApplication`,
`BootstrapApplication`, `MigrationApplication`, `HotApplication`, `PostStreamApplication`,
`TtlApplication`; acyclic, depth 1, with a single depth-2 exception
(`PostApplication | NotificationApplication | TtlApplication → PostStreamApplication → FileApplication`).
Static classes mean this is *not* compiler-enforced: it is on you. ESLint enforces only a narrow set
(`eslint.config.mjs`): `NEXT_PUBLIC_*` reads limited to the four build-intrinsic names and no direct
`process.env.PUBKY_RUNTIME_*` read outside `src/libs/env` and the runtime-config resolver, no
importing Toaster internals, no `as any` / `as unknown as T` in tests, plus import sorting and
padding conventions. Nothing fails the build when you skip a layer.

Import conventions: `@/atoms|molecules|organisms|templates/*` for components (concrete file, e.g.
`@/atoms/Button/Button`), `@/hooks/*`, `@/controllers/*`, `@/application/*`, `@/services/*`,
`@/models/*`, `@/pipes/*`, `@/stores/*`, `@/config/<module>`, `@/app/routes`, `@/icons`,
`@/libs/...`. Relative imports for siblings in the same tier or feature subtree.

## How to Approach a Change

1. Restate the request as behaviour, then find the nearest working feature that already does it
   (feed, post detail, collections, profile, settings, notifications are good reference systems).
2. Trace that feature end to end and name the files you will touch, one per layer.
3. Decide the layer for each edit before writing code. If a view needs new data, the change starts at
   controller → application → service and ends at a hook; the component stays dumb.
4. Reuse: existing atom/molecule, existing hook, existing pipe, existing config constant.
5. Make the smallest coherent change, following the naming rules below.
6. Verify at the right level (see Testing), then read your own diff for drift: stray `useMemo`, hex
   colours, a new `index.ts`, an unrelated rename, a raw `Error`, a direct `process.env` read.
7. If the change alters a UI surface with a VRT baseline, say so; if it needs an ADR-worthy decision,
   mention it rather than silently inventing a pattern.

Controller naming encodes IO and guarantee (`docs/local-first.md`):
`fetch*` network only · `get*` local only · `getMany*` bulk local → `Map<Pubky, T>` ·
`getOrFetch*` local then network · `getMany*OrFetch` bulk variant · `subscribe*` long-lived stream ·
`commitCreate|commitUpdate|commitDelete*` local-first write + sync. `load*`/`save*`/`retrieve*` are
wrong here.

Worked example - "create a collection" (`src/hooks/useCreateCollection/useCreateCollection.ts` →
`src/core/controllers/post/post.ts` `commitCreateCollection` → `src/core/application/post/post.ts`
`commitCreate`):

1. The dialog uses the form hook: `form` (RHF + zod schema from `useCreateCollection.types.ts`),
   a cover picker from `useCoverImagePicker`, and `submit(): Promise<string | null>`.
2. `submit()` calls `PostController.commitCreateCollection({ authorId, name, description, coverImage, layout })`
   and maps the `AppError` to a toast (`toast({ variant: 'error', ... })`). Do not add a `Logger.error`
   of your own: `Err.*` factories already log and capture the failure (ADR-0015). The `Logger.error` in
   today's `useCreateCollection` is debt, not part of the pattern to copy.
3. The controller uploads the cover through `FileApplication.toFileAttachment`/`commitCreate`, builds
   the payload with `PostNormalizer.toCollection(...)`, derives `compositePostId` with
   `buildCompositeId`, then calls `PostApplication.commitCreate({ compositePostId, post, postUrl })`.
4. The application writes Dexie (`LocalPostService.create`) then syncs (`HomeserverService.request`).
5. On success the hook stashes a blob URL in `useLocalFilesStore` for instant rendering and toasts
   static copy. No layer below the hook knows about React, and no component knows about the network.

## Existing Patterns to Reuse

- Writes: `PostApplication.commitCreate` (`src/core/application/post/post.ts`) is the reference
  local-first write: upload files (`FileApplication`) → `LocalPostService.create` →
  `HomeserverService.request({ method: PUT, url: postUrl })` → `TagApplication.commitCreate`, with a
  compensating rollback (delete the local row and the uploaded files) when the homeserver call fails.
  Copy that shape: local write first, sync second, roll back on failure, and refresh the entity's TTL
  row (`PostTtlModel.upsert({ id, lastUpdatedAt: Date.now() })`) for every affected entity. Controllers
  normalize with pipes first (`src/core/controllers/post/post.ts`, `PostNormalizer.to`,
  `TagNormalizer` in `src/core/pipes/tag/tag.normalizer.ts`).
- Reads: `PostController.getDetails({ compositeId })` for the local read and `PostController.fetch({ compositeId })`
  for the Nexus fetch; `UserController.getManyDetails(params)` / `getOrFetchDetails`;
  `StreamPostsController.getOrFetchStreamSlice({ streamId, streamTail, lastPostId, limit })` (the viewer
  is derived inside the controller from `useAuthStore.getState().currentUserPubky`, and `streamHead` /
  `order` are optional; there is no `viewerId` or `cursor` parameter).
- Local-first reads in hooks (ADR-0011): use `useLocalFirstQuery` from
  `@/hooks/useLocalFirstQuery/useLocalFirstQuery` - `{ queryFn, fetchFn, deps, enabled }`, where
  `queryFn` is a pure `get*` local read run inside `useLiveQuery` and `fetchFn` is a `fetch*` controller
  that persists to Dexie. `src/hooks/usePostDetails/usePostDetails.tsx` is the canonical consumer
  (`rg -l useLocalFirstQuery src/hooks --glob '!*.test.*'` lists the consumers). Never call a network
  client, TanStack Query or retry logic inside `useLiveQuery`
  (that breaks Dexie's PSD, ADR-0011), and do not hand-roll a `useEffect` + `useLiveQuery` pair.
- Forms: react-hook-form + zod via `@hookform/resolvers/zod`, wrapped in a hook that returns
  `{ form, submit, reset, ... }`; schema, `*_FORM_FIELDS` map, inferred type and defaults live in a
  sibling `*.types.ts` - canonical example `src/hooks/useCreateCollection/useCreateCollection.{ts,types.ts}`.
  Field components render `Controller` with `ControlledInputField` / `ControlledTextareaField`;
  schemas carry literal US-English messages. `submit()` returns `Promise<boolean>`
  (or `Promise<string | null>` when the caller navigates to the created entity).
  Non-text inputs get their own hook (`useCoverImagePicker`) composed by the form hook.
- Errors: `Err.network|timeout|server|client|auth|rateLimit|validation|database(code, message, { service, operation, context, cause })`;
  helpers in `src/libs/error/error.utils.ts` (`isNetworkError`, `isRetryable`, `requiresLogin`,
  `isNotFound`, `hasHttpStatus`, `getRetryAfter`, `toAppError`, `getErrorMessage`); HTTP boundary is
  `safeFetch` / `httpResponseToError` / `httpStatusCodeToError` (`src/libs/error/error.http.ts`) and
  `parseResponseOrThrow` (`src/libs/http/response.utils.ts`). Each service wraps them in its own
  `<service>.utils.ts` (e.g. `src/core/services/nexus/nexus.utils.ts`); call services, not raw `fetch`.
- Toasts: `toast()` from `@/molecules/Toaster/toast` with `variant: default|error|warning|info`.
  Internals (`toast.store`, `useToastState`, `@/atoms/Toast/*`) are ESLint-blocked. Copy is static:
  never interpolate user-entered text (this is the rule from #2475: generic copy such as `'Collection
  created'`, config constants and small counts are fine; names, labels and file names are not).
- Config/constants: hard limits live in `src/config/*` and are project-wide - do not tune them for a
  local UI fix.
- Icons: named imports from `lucide-react`; custom/brand SVGs from `@/icons`; runtime-chosen names via
  the `DynamicLucideIcon` atom (`preloadLucideIcons`); URL→icon helpers in `@/libs/utils/urlToIcon`.
- Route constants and helpers: `@/app/routes` - enums (`APP_ROUTES`, `PROFILE_ROUTES`, `POST_ROUTES`,
  `SETTINGS_ROUTES`, `COLLECTION_ROUTES`, `ONBOARDING_ROUTES`, `AUTH_ROUTES`) and builders
  (`getProfileRoute`, `getCollectionRoute`, `getUserProfileUrl`, `getContentSearchUrl`), plus the
  guard sets (`UNAUTHENTICATED_ROUTES`, `NEEDS_PROFILE_CREATION_ROUTES`, `AUTHENTICATED_ROUTES`) and
  predicates (`isDynamicPublicRoute`, `isCoreExploreRoute`, `isPublicExploreRoute`, `matchPostRoute`).
  Never hardcode a path string in a component; add or use a builder.
- Composite post ids `author:postId` via `buildCompositeId` / `parseCompositeId`
  (`src/core/models/models.utils.ts`), never string-concatenated ad hoc.
- Skeleton loaders: `@/atoms/Skeleton/Skeleton`, colocated `Xxx.skeleton.tsx` when single-owner,
  promote to `XxxSkeleton/` at 2+ parents, counts from constants or props - never literals.

## Frontend and Design System

- Styling is Tailwind v4 with CSS variables in `src/app/globals.css` (`@theme` tokens) plus Shadcn
  components; `cn` from `@/libs/utils/utils`; variants via `cva` + `VariantProps`.
- Tiers: `atoms/` primitives, `molecules/` atom combinations, `organisms/` complex features,
  `templates/` page layouts rendered by route files. `ls src/components/<tier>` is the inventory, read
  it rather than working from a list here. The split, by example: `@/atoms/Button/Button` is generic and
  reusable, `@/molecules/ControlledInputField` composes atoms into a form control,
  `@/organisms/DialogBackup` owns a multi-part feature, and a template is what a route file renders.
- Theme/tokens: never introduce new colours, spacing, radius or shadows; use semantic tokens
  (`bg-primary`, `bg-muted`, `text-muted-foreground`) and the Tailwind scale.
- Z-index: only `-z-10`, `z-10`, `z-30`, `z-40`, `z-50`, `z-60` (`docs/z-index.md`). Modals `z-50`,
  their overlay `z-40`, fixed nav/FAB `z-40`.
- Responsive: `useIsMobile` / `useFeedLayoutResolution` for JS-driven layout, CSS (`lg:hidden`) for
  pure visual. Mobile viewport for tests is 390×844.
- Component files: `Button/Button.tsx` + `Button.types.ts` + `Button.test.tsx`, `forwardRef`,
  `displayName`, no re-export-only `index.ts`.
- Loading, empty and error states are part of the design system, not filler: loading uses
  `@/atoms/Skeleton/Skeleton` (+ `Spinner`), empty states reuse the closest existing molecule
  (`PostsEmpty`, `SearchEmptyState`, `TaggedEmpty`, `NotificationsEmpty`, `Follow*Empty`, or the
  illustrated `IllustratedEmptyState`), and error states use `src/app/error.tsx` /
  `global-error.tsx`, `DatabaseErrorScreen`, `react-error-boundary` and `toast({ variant: 'error' })`.
  Do not invent extra placeholder markup or copy for a state that already has a component.
- Feature-specific bespoke UI is legitimate inside its feature folder; do not generalise a one-off
  into a shared primitive, and do not fork a shared primitive because your case differs slightly.
- Figma parity: when the task comes from a Figma frame, match it rather than approximating it:
  spacing, dimensions, radius, shadow, active/inactive/hover/focus/disabled states, and the
  desktop/mobile variants. Read the active vs inactive styling from the Shadcn `Button` variant
  (`Selected` vs `Default`), not from the parent frame or a lookalike surface.
- Naming: `Dialog<Thing>` for dialogs (`DialogConfirmDelete` is a molecule, `DialogBackup*` are
  organisms), `XxxSkeleton` for loaders, `Xxx.types.ts` next to `Xxx.tsx`, `*.store.ts` + `*.selectors.ts` in core stores.

## Data, State, and APIs

- Dexie schema: `src/core/database/franky/franky.ts` (one `DB_VERSION`, recreated rather than migrated);
  access the data only through `src/core/services/local/*`. Tables: `user_details`, `user_counts`,
  `user_relationships`, `user_connections`, `user_tags`, `post_details`, `post_counts`,
  `post_relationships`, `post_tags`, `*_ttl`, `post_streams`, `unread_post_streams`, `user_streams`,
  `tag_streams`, `file_details`, `bookmarks`, `hot_tags`, `feeds`, `moderation`, `notifications`
  (`rg 'Table<' src/core/database/franky/franky.ts` is the full list).
- Streams are caches (ADR-0003) with TTL-driven staleness (ADR-0005): local services update
  `*_ttl.lastUpdatedAt` on every write; forgetting it leaves a cache that never refreshes. TTL values
  are runtime-configurable (`PUBKY_RUNTIME_TTL_*`) via `src/config/sync`.
- Deferred stream invalidation: mutations mark scopes dirty in
  `src/core/services/local/stream/posts/postStreamDirtyRegistry.ts`; mounted feeds are not yanked.
- Persist dependencies before dependents (author, then post, then tags).
- State: Zustand stores in `src/core/stores/<domain>/*.store.ts` with `*.selectors.ts` companions
  (`useAuthStore`, `useHomeStore`, `useNotificationStore`, `useSearchStore`, `useSignInStore`,
  `useLocalFilesStore`, `useFeedOptimisticStore`, `useCollectionReorderStore`, …) hold global UI state;
  local component state stays local. Stores hold no business logic and are read by controllers and
  coordinators (`useAuthStore.getState().selectCurrentUserPubky()`). A new **persisted** store key must
  be registered in `src/core/stores/persistedKeys.ts` - `PERSISTED_STORE_KEYS` drives the logout/clear
  sweep.
- Server data: TanStack Query (`src/libs/query-client`) for query-shaped fetches, retry decisions
  derived from `AppError.category`; Dexie `useLiveQuery` for local reads.
- HTTP: never raw `fetch` with ad-hoc error handling. Browser→`/api/*` calls use
  `src/libs/api/client-request.ts` (see `useFeedback`, `useReportPost`); service calls use the service's
  own `*.utils.ts` over `safeFetch` (`src/libs/error/error.http.ts`).
- Identities: pubky public keys are normalized (`stripPubkyPrefix`); session/auth lives in
  `src/core/services/homeserver` + `useAuthStore`; unauthenticated browsing uses the explore routes
  and `useRequireAuth().requireAuth()` for gated actions.

## Local-First Read and TTL Pitfalls

Two bug classes account for most of this repo's regressions. Read this before touching a read path or
anything that writes TTL rows.

`useLocalFirstQuery` is deliberately simple, and most of its surprises are documented only by its
call sites and past issues:

- `fetchFn` runs **only when local data is `null`**. A cache hit is never refreshed, so a stale
  counter/number that "never updates" is usually this, not the component (#2384).
- A tombstone is still local data: soft-deleted rows (`content = [DELETED]`) keep the cache non-null,
  so the network arm never fires and the UI renders the tombstone forever (#1988). Check what "missing"
  means for the entity you are rendering.
- Every hook instance owns its own effect. Mounting the same query twice (list plus expanded row, or a
  nested card) duplicates every request; hoist the query and pass data down (#1987).
- `isLoading` is true while a cache-miss fetch is in flight, but `.finally()` clears `isFetching`
  whether `fetchFn` resolves or rejects (its unit test asserts the settled `{ data: null, isLoading:
  false }` after a rejection). A Nexus 404 therefore settles at `data === null`, it does not leave a
  skeleton with no exit, and the hook exposes no error value at all. `usePostMissing` turns that
  settled `null` into `postMissing`. Branch on the settled value, not on `isLoading` and `data` alone.
- `isMissing = postDetails === null` is the established "not found" shape (#2081, #1986); keep that
  meaning.

TTL refresh races are the second class:

- A background refresh that lands after a local write reverts the user's action (#1781) or flickers the
  tag UI (#1452, #1276). A local write must mark every affected row fresh (`*_ttl.lastUpdatedAt`) so
  the coordinator skips it; a stale Nexus response must never overwrite a fresher local write.
- TTL refresh also applies to public content for signed-out visitors (#2486). Do not assume
  "logged out" means "no background refresh".
- Do not force freshness by clearing stream caches: invalidate the affected scope through the dirty
  registry and let the TTL/viewport policy refetch (ADR-0003, ADR-0005).

## Backend / Services

There is no separate backend in this repo; the "backend" is the layer stack plus remote services:

- `services/homeserver` - session, PUT/POST/DELETE writes, blob uploads, signup tokens.
- `services/nexus` - paginated reads (bootstrap, streams, users, posts, tags, search, files).
- `services/homegate` (SMS/phone verification), `chatwoot` (support), `exchangerate` (SAT/USD),
  `nextjs` (server-only work such as OG metadata scraping) plus Next route handlers under `src/app/api/`.
- Service worker: `src/sw.ts` (Serwist, share-target + local file cache, ADR-0016); its output
  `public/sw.js` is generated.

## Sensitive or High-Risk Areas

- `src/core/database/franky/franky.ts` - one `this.version(DB_VERSION).stores({...})` definition, with
  `DB_VERSION = Env.NEXT_PUBLIC_DB_VERSION` (`src/config/database.ts`). There is no incremental
  migration chain: a version mismatch makes the client delete and recreate the local database
  (`recreateDatabase`), i.e. user-visible local data loss, so bumping the version or editing a table's
  index map is a deliberate, reviewed change, not a side effect of a feature. ADR-0019 supersedes
  ADR-0007, which describes an ascending-migration chain the code never had
  (`docs/adr/0019-dexie-recreate-on-version-mismatch.md`).
- `src/core/services/homeserver/**` and `src/core/pipes/**` - wire-format boundaries
  (`pubky-app-specs`, composite ids, signup tokens, auth URLs). Preserve payload shapes; do not change
  a format incidentally while adding a feature.
- `src/core/services/local/**` - writer of Dexie + TTL invariants; getting the order wrong corrupts
  caches silently. Mirror existing multi-table patterns and use the dirty registry rather than
  deleting stream rows eagerly.
- `src/libs/env/env.ts` + `src/libs/runtime-config/**` - the only places allowed to read
  `process.env.NEXT_PUBLIC_*` / `process.env.PUBKY_RUNTIME_*`, and ESLint enforces exactly those two
  families rather than `process.env` at large. `Env` is the whole validated build-time schema: the
  build-intrinsic public values (`NEXT_PUBLIC_DB_NAME`, `NEXT_PUBLIC_DB_VERSION`,
  `NEXT_PUBLIC_DEBUG_MODE`, `NEXT_PUBLIC_APP_VERSION`) plus the server-only variables
  (`HOMESERVER_ADMIN_URL`, `HOMESERVER_ADMIN_PASSWORD`, the Chatwoot `BASE_URL_SUPPORT` /
  `SUPPORT_API_ACCESS_TOKEN` / `SUPPORT_ACCOUNT_ID`, `NODE_ENV`, `VITEST`). Build-intrinsic or
  server-only values belong in `env.ts`; a value that has to vary per deployment goes in a
  `PUBKY_RUNTIME_*` getter instead, and runtime config is injected into the browser as
  `window.__PUBKY_CONFIG__`, so never put a secret there.
- Auth, keys, recovery phrase, password, phone and backup modules (`src/libs/{password,identity,phone}`,
  `src/components/organisms/{Backup,DialogBackup*,DialogRestore*}`, `Human*`) - cryptographic and
  identity flows. Trace call sites before changing shared behaviour; no opportunistic refactors.
- `src/core/services/nextjs/og-metadata/**` + `src/libs/network/network.ts` - server-side fetching of
  user-supplied URLs for link previews, deliberately SSRF-guarded (`checkDnsSafety`, `isIpSafe`, DNS
  rebinding checks). Any change here is a security change: keep the guards and their tests intact.
- `src/sw.ts`, `next.config.ts`, `instrumentation*.ts`, `sentry.*.config.ts`, CI workflows - build and
  runtime plumbing with cross-cutting effects.
- `src/core/application/` cross-domain calls: verify the ADR-0009 allow-list before wiring two
  applications together.

## Testing and Verification

Commands (from `package.json`):

```bash
npm run format:check   # prettier
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm test               # vitest --project unit (jsdom)
npm test -- src/components/atoms/Button/Button.test.tsx   # one file
npm test -- -t "snapshot"                                 # one pattern
npm run test:update-snapshots
npm run test:vrt                       # vitest --project vrt (chromium+firefox+webkit)
npm run test:vrt:check-baselines       # every __screenshots__ folder has a sibling test
npm run build                          # next build --webpack (CI also smoke-tests `next start`)
npm run start:e2e                      # cypress open, interactive
npm run test:e2e                       # cypress run, firefox
npm run start:e2e:mobile               # interactive, mobile cypress config
npm run test:e2e:mobile                # headless, mobile cypress config
npm run test:vrt:regenerate-baseline   # --update; CI-owned, do not commit the output (see VRT section)
```

Cypress e2e needs the full pubky-stack (private `pubky/pubky-stack` at `staging`, homeserver/nexus
images) and runs on push to `master`/`dev` in CI; do not attempt it from a bare checkout, and do not
report an e2e result you did not obtain.

Right-sized verification: a component change → its colocated test + `npm run lint` +
`npm run typecheck`; a core change → affected package tests plus typecheck/lint; a
`runtime-config`/`env` change → `npm test -- src/libs/runtime-config`; anything touching a VRT
surface → `npm run test:vrt` and flag the baseline. Run the full `npm test` before handing off a
cross-cutting change.

Test conventions: colocated `*.test.tsx`, `describe('<Component>')` plus a separate
`describe('<Component> - Snapshots')` with exactly one `expect().toMatchSnapshot()` per test and
unique elements; mobile blocks (`- Mobile Snapshots`) for organisms/templates that use `useIsMobile`
directly or through a child, via `setMobileViewport()`/`resetViewport()` from `@/test-utils/viewport`.
Mock only network/fs/time/boundaries, keep real implementations of pure helpers, keep Lucide,
`@/icons`, `DynamicLucideIcon` and Radix components real, and use fake timers for relative time.
`as any` and `as unknown as T` are ESLint-banned in tests: use `asInvalid`, `asOpaque`,
`mockAuthStore`, `mockSession`, `mockResponse`, `mockKeyboardEvent`, etc. from `src/test-utils`.
VRT: `docs/visual-regression-testing.md` is canonical (commands, the CI table, determinism rules).
Tests live in `src/test/vrt/<area>/*.vrt.test.tsx` (feed, landing, onboarding, post, profile, settings;
the `images/` folder holds fixtures only) with baselines in the sibling `__screenshots__/` folder - not
next to the component. `npm run test:vrt:check-baselines` enforces that every `__screenshots__` folder
has sibling tests. Baselines are owned by CI: `.github/workflows/vrt-update-baselines.yml` is
`workflow_dispatch` only and refuses `master`, so dispatch it from `dev` (it commits to a
`vrt-update-baselines` branch and opens a PR to `dev`) or from a feature branch (it commits there). PR
CI does not run VRT, so a UI change that shifts pixels must be surfaced to the user rather than
"verified" locally.
Manual checks for UI work: desktop and narrow viewport, loading/empty/error states, hover/focus/
disabled states, dark-on-brand contrast, and the mobile path where a Sheet replaces a Popover.

Commits and PRs: `type(scope): description`, imperative, no capital, no trailing period, ≤72 chars
(`docs/commit-message.md`); one change per PR; draft unless a ready PR was asked for.

## Legacy and Recently Removed Patterns

- i18n is gone (tracking issue #2305; #2306 made English the only language, #2313 removed the
  infrastructure and rewrote ~1,000 call sites). New copy is a literal; JSX text with
  apostrophes stays in a `{'...'}` container. If your branch predates it, follow
  `docs/migrations/2305-i18n-conflict-guide.md` and keep
  `grep -rn "next-intl\|useTranslations\|@/i18n" src cypress` empty.
- `/profile/[pubky]/posts` is a legacy path kept as a 308 redirect in `next.config.ts`; the canonical
  route is `/profile/[pubky]`. Do not resurrect the old page.
- `isPublicRoute` on `usePublicRoute()` is a legacy alias for `isDynamicPublicRoute` (false on
  `/home`, which is browsable). Use `isCoreExploreRoute` / `isDynamicPublicRoute` / `isPublicExploreRoute`.
- `AppError.type` / `statusCode` / `details` still exist on some paths (phase-2 migration of ADR-0015);
  new code uses `category` + `code` from `Err.*` factories.
- `docs/` is mirrored for tooling: `.cursor/rules/*.mdc` and `.greptile/rules.md` restate the same
  architecture rules, and `.cursor/skills/*/SKILL.md` holds editor skills. Update `docs/` (plus an ADR
  when the rule changes) and the mirrors follow, not the other way round.

## Common AI Failure Modes

- Putting IO (fetch, Dexie) in a component, hook or pipe; calling a service from a controller; calling
  application from a coordinator.
- Creating a new store, a second data-fetching mechanism, or a parallel error type instead of using
  Zustand/TanStack/`Err.*`.
- Writing a new button/dialog/input/empty-state/skeleton instead of reusing or extending the atom,
  molecule or Shadcn primitive that already exists.
- Hardcoded colours, arbitrary Tailwind values, off-scale z-index, new shadow/radius tokens.
- Adding `useMemo`/`useCallback` (compiler handles it) or `useEffect` where a `useLiveQuery` read plus
  a controller call belongs.
- Interpolating user text into toast copy; styling toasts by `className`.
- Editing generated files (`public/sw.js`, `lucideIcons.{aliases,nodes,tags}.ts`), `package-lock.json`,
  or changing CI workflows outside a CI task.
- Coercing types in tests with `as any` / `as unknown as T` instead of `src/test-utils` helpers.
- Treating a local cache hit as proof the data is current, or writing a new freshness mechanism beside
  TTL (see *Local-First Read and TTL Pitfalls*).
- Adding a dependency for something already available: `dexie`, `zustand`, `@tanstack/react-query`,
  `react-hook-form` + `zod`, `radix-ui`, `@dnd-kit/*`, `motion`, `lucide-react`, `lodash-es`,
  `usehooks-ts`, `react-error-boundary`, `embla-carousel-react`, `react-easy-crop`, `libphonenumber-js`,
  `qrcode.react`, `jszip`, `@synonymdev/pubky`, `pubky-app-specs` and `cn` are already in the tree.
- Turning a feature task into a refactor: renaming shared symbols, converting one pattern to another,
  reformatting untouched files, "fixing" duplication whose two copies serve different features.
- Ignoring composite ids, TTL updates or persistence order, producing local data that looks right and
  never refreshes.
- Rewriting a route's page file with a whole new layout instead of composing the existing template.

## Decision Heuristics

- If the change is data, start at controllers/application/services; if it is presentation, start at
  the component and keep it hooked, never IO-aware.
- Before creating a component, search `src/components/**` for an atom/molecule that does it; before a
  hook, search `src/hooks/`; before a helper, `src/libs/**` and `src/core/utils/**`.
- Prefer extending an existing component with a variant (`cva` variant or prop) over forking it.
- Prefer a colocated private component/skeleton over a new shared tier entry; promote on second use.
- Prefer server-side Nexus reads through `services/nexus` and local-first writes through
  `application` - never a component-level fetch.
- When changing a shared primitive, grep every consumer first and re-run the affected tests.
- When two patterns exist, follow the one the docs and ADRs name, and check whether the other is
  legacy before copying it.
- When a request is ambiguous about scope, implement the smallest behaviour-preserving version and
  state the assumption instead of building a framework.
- When a local defect blocks the work, fix it narrowly and explain why, rather than refactoring around it.
- A stale value, a spinner that never ends or a request storm is a read-path question first: check
  `useLocalFirstQuery` semantics (cache hit, tombstone, duplicate instances, missing branch) before
  touching the component that renders it.
- If the fix requires bumping `DB_VERSION` or changing a `src/config/*` limit, stop and raise it: those
  are product-level decisions, not implementation details.

## Definition of Done

- [ ] Change lives in the correct layer and only there; no boundary crossed.
- [ ] Naming follows controller prefixes and file/type conventions.
- [ ] Reused existing primitive, hook, pipe, config constant; no new dependency without a reason.
- [ ] Errors are `AppError` via `Err.*`; nothing double-logs.
- [ ] No new colours, spacing, z-index values, or unauthorised `useMemo`/`useCallback`.
- [ ] Local-first consequences considered: cache hits, tombstones and missing rows handled on reads;
      affected rows marked fresh on writes; no second freshness mechanism.
- [ ] No existing visible behaviour silently reduced, and no `src/config/*` limit tuned for a local fix.
- [ ] Commit messages follow `docs/commit-message.md`; the diff contains no unrelated cleanup.
- [ ] Imports are concrete alias paths; no barrel files added.
- [ ] Tests at the right level updated/added, including mobile snapshots for viewport-aware organisms.
- [ ] `npm run lint`, `npm run typecheck`, targeted tests pass; `npm run build` when the change is
      route/config wide.
- [ ] VRT baseline impact flagged to the user; no unrelated files in the diff.
- [ ] Diff reads like the surrounding code and contains no unrelated refactor.
