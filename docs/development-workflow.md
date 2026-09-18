# Development Workflow

How to make a change to this repo that a maintainer would write: right layer, right primitive, smallest coherent diff, verified with the project's own commands. `AGENTS.md` carries the short version of this page; the other `docs/` pages own the conventions it points to.

## How to Approach a Change

1. Restate the request as behaviour, then find the nearest working feature that already does it (feed, post detail, collections, profile, settings, notifications are good reference systems).
2. Trace that feature end to end and name the files you will touch, one per layer.
3. Decide the layer for each edit before writing code. If a view needs new data, the change starts at controller → application → service and ends at a hook; the component stays dumb.
4. Reuse: existing atom/molecule, existing hook, existing pipe, existing config constant. Before creating any component, hook, service, pipe, util, constant or type, search the repo for a semantic equivalent first.
5. Make the smallest coherent change, following the naming rules in `local-first.md` and `components.md`.
6. Verify at the right level (see [Verification](#verification)), then read your own diff for drift: a stray `useMemo`, a hex colour, a new `index.ts`, an unrelated rename, a raw `Error`, a direct `process.env` read.
7. If the change alters a UI surface with a VRT baseline, say so; if it needs an ADR-worthy decision, mention it rather than silently inventing a pattern.

## Worked Example: Create a Collection

`src/hooks/useCreateCollection/useCreateCollection.ts` → `src/core/controllers/post/post.ts` (`commitCreateCollection`) → `src/core/application/post/post.ts` (`commitCreate`):

1. The dialog uses the form hook: `form` (react-hook-form + zod schema from `useCreateCollection.types.ts`), a cover picker from `useCoverImagePicker`, and `submit(): Promise<string | null>`.
2. `submit()` calls `PostController.commitCreateCollection({ authorId, name, description, coverImage, layout })` and maps the `AppError` to a toast (`toast({ variant: 'error', ... })`). It does not add a `Logger.error` of its own: `Err.*` factories already log and capture the failure (ADR-0015). The `Logger.error` in today's `useCreateCollection` is debt, not part of the pattern to copy.
3. The controller uploads the cover through `FileApplication.toFileAttachment` / `commitCreate`, builds the payload with `PostNormalizer.toCollection(...)`, derives `compositePostId` with `buildCompositeId`, then calls `PostApplication.commitCreate({ compositePostId, post, postUrl })`.
4. The application writes Dexie (`LocalPostService.create`) then syncs (`HomeserverService.request`).
5. On success the hook stashes a blob URL in `useLocalFilesStore` for instant rendering and toasts static copy. No layer below the hook knows about React, and no component knows about the network.

## Existing Patterns to Reuse

- **Writes:** `PostApplication.commitCreate` (`src/core/application/post/post.ts`) is the reference local-first write: upload files (`FileApplication`) → `LocalPostService.create` → `HomeserverService.request({ method: PUT, url: postUrl })` → `TagApplication.commitCreate`, with a compensating rollback (delete the local row and the uploaded files) when the homeserver call fails. Copy that shape: local write first, sync second, roll back on failure, and refresh the entity's TTL row (`PostTtlModel.upsert({ id, lastUpdatedAt: Date.now() })`) for every affected entity. Controllers normalize with pipes first (`PostNormalizer.to`, `TagNormalizer` in `src/core/pipes/tag/tag.normalizer.ts`).
- **Reads:** `PostController.getDetails({ compositeId })` for the local read and `PostController.fetch({ compositeId })` for the Nexus fetch; `UserController.getManyDetails(params)` / `getOrFetchDetails`; `StreamPostsController.getOrFetchStreamSlice({ streamId, streamTail, lastPostId, limit })` (the viewer is derived inside the controller from `useAuthStore.getState().currentUserPubky`; `streamHead` / `order` are optional; there is no `viewerId` or `cursor` parameter).
- **Local-first reads in hooks:** `useLocalFirstQuery` — see `local-first.md`, _Pattern: `useLocalFirstQuery`_ and _Read pitfalls_.
- **Forms:** see `components.md`, _Forms_.
- **Errors:** `Err.network|timeout|server|client|auth|rateLimit|validation|database(code, message, { service, operation, context, cause })` (`src/libs/error/error.factories.ts`); helpers in `src/libs/error/error.utils.ts` (`isNetworkError`, `isRetryable`, `requiresLogin`, `isNotFound`, `hasHttpStatus`, `getRetryAfter`, `toAppError`, `getErrorMessage`); HTTP boundary is `safeFetch` / `httpResponseToError` / `httpStatusCodeToError` (`src/libs/error/error.http.ts`) and `parseResponseOrThrow` (`src/libs/http/response.utils.ts`). Each service wraps them in its own `<service>.utils.ts` (e.g. `src/core/services/nexus/nexus.utils.ts`); call services, not raw `fetch`. Full conventions: `error-handling.md`.
- **Toasts:** `toast()` from `@/molecules/Toaster/toast` with static copy — see `components.md`, _Toasts_.
- **Config and constants:** hard limits live in `src/config/*` and are product-wide policy. Never tune one for a local UI fix; if the policy itself must change, say so in the PR.
- **Icons:** named imports from `lucide-react`; custom/brand SVGs from `@/icons`; runtime-chosen names via the `DynamicLucideIcon` atom (`preloadLucideIcons`); URL→icon helpers in `@/libs/utils/urlToIcon`. See `components.md`, _Icons_.
- **Routes:** `@/app/routes` — enums (`APP_ROUTES`, `PROFILE_ROUTES`, `POST_ROUTES`, `SETTINGS_ROUTES`, `COLLECTION_ROUTES`, `ONBOARDING_ROUTES`, `AUTH_ROUTES`), builders (`getProfileRoute`, `getCollectionRoute`, `getUserProfileUrl`, `getContentSearchUrl`), guard sets (`UNAUTHENTICATED_ROUTES`, `NEEDS_PROFILE_CREATION_ROUTES`, `AUTHENTICATED_ROUTES`) and predicates (`isDynamicPublicRoute`, `isCoreExploreRoute`, `isPublicExploreRoute`, `matchPostRoute`). Never hardcode a path string in a component.
- **Composite post ids** (`author:postId`) via `buildCompositeId` / `parseCompositeId` (`src/core/models/models.utils.ts`), never string-concatenated ad hoc.
- **Skeleton loaders:** `@/atoms/Skeleton/Skeleton`, colocated `Xxx.skeleton.tsx` when single-owner, promoted to `XxxSkeleton/` at 2+ parents, counts from constants or props, never literals (`skeleton-architecture.md`).

## Frontend Notes

Styling, tokens, z-index, atomic tiers, file layout and Figma parity are in `components.md` and `z-index.md`. Additional rules that are easy to miss:

- **Loading, empty and error states are part of the design system, not filler.** Loading uses `@/atoms/Skeleton/Skeleton` (plus `Spinner`); empty states reuse the closest existing molecule (`PostsEmpty`, `SearchEmptyState`, `TaggedEmpty`, `NotificationsEmpty`, `Follow*Empty`, or the illustrated `IllustratedEmptyState`); error states use `src/app/error.tsx` / `global-error.tsx`, `DatabaseErrorScreen`, `react-error-boundary` and `toast({ variant: 'error' })`. Do not invent extra placeholder markup or copy for a state that already has a component.
- **Responsive:** `useIsMobile` / `useFeedLayoutResolution` for JS-driven layout, CSS (`lg:hidden`) for pure visual. Mobile viewport for tests is 390×844. On mobile a Sheet often replaces a Popover; check both paths.
- **Feature-specific bespoke UI is legitimate inside its feature folder.** Do not generalise a one-off into a shared primitive, and do not fork a shared primitive because your case differs slightly; prefer a `cva` variant or a prop.
- **Naming:** `Dialog<Thing>` for dialogs (`DialogConfirmDelete` is a molecule, `DialogBackup*` are organisms), `XxxSkeleton` for loaders, `Xxx.types.ts` next to `Xxx.tsx`, `*.store.ts` + `*.selectors.ts` in core stores. Component files: `Button/Button.tsx` + `Button.types.ts` + `Button.test.tsx`, `forwardRef`, `displayName`, no re-export-only `index.ts`.
- **Legacy route:** `/profile/[pubky]/posts` is kept only as a 308 redirect in `next.config.ts`; the canonical route is `/profile/[pubky]`. Do not resurrect the old page.

## Data, State and APIs

- **Dexie:** schema and tables in `data-patterns.md` (_Data Model Reference_, _Schema changes_); access the data only through `src/core/services/local/*`.
- **Streams and TTL:** streams are caches (ADR-0003) with TTL-driven staleness (ADR-0005); local services update `*_ttl.lastUpdatedAt` on every write, and forgetting it leaves a cache that never refreshes. TTL values are runtime-configurable (`PUBKY_RUNTIME_TTL_*`) via `src/config/sync.ts`. Persist dependencies before dependents (author, then post, then tags). Deferred stream invalidation goes through `postStreamDirtyRegistry` (`local-first.md`).
- **State:** Zustand stores in `src/core/stores/<domain>/*.store.ts` with `*.selectors.ts` companions hold global UI state; local component state stays local. Stores hold no business logic and are read by controllers and coordinators (`useAuthStore.getState().selectCurrentUserPubky()`). A new **persisted** store key must be registered in `src/core/stores/persistedKeys.ts`: `PERSISTED_STORE_KEYS` drives the logout/clear sweep.
- **Server data:** TanStack Query (`src/libs/query-client`) for query-shaped fetches, with retry decisions derived from `AppError.category`; Dexie `useLiveQuery` for local reads.
- **HTTP:** never raw `fetch` with ad-hoc error handling. Browser → `/api/*` calls use `src/libs/api/client-request.ts` (see `useFeedback`, `useReportPost`); service calls use the service's own `*.utils.ts` over `safeFetch`.
- **Identities:** pubky public keys are normalized (`stripPubkyPrefix`); session/auth lives in `src/core/services/homeserver` + `useAuthStore`; unauthenticated browsing uses the explore routes and `useRequireAuth().requireAuth()` for gated actions (`components.md`, _Explore mode_).

## Services Map

There is no separate backend in this repo; the "backend" is the layer stack plus remote services:

- `services/homeserver` — session, PUT/POST/DELETE writes, blob uploads, signup tokens.
- `services/nexus` — paginated reads (bootstrap, streams, users, posts, tags, search, files).
- `services/homegate` (SMS/phone verification), `chatwoot` (support), `exchangerate` (SAT/USD), `nextjs` (server-only work such as OG-metadata scraping) plus Next route handlers under `src/app/api/`.
- Service worker: `src/sw.ts` (Serwist, share-target + local file cache, ADR-0016); its output `public/sw.js` is generated.

High-risk areas (schema, wire formats, TTL writers, env/runtime config, auth/keys, SSRF guards, build plumbing) are listed in `architecture.md`, _High-Risk Areas_.

## Verification

Commands (from `package.json`; Node 24 via `.nvmrc`, dependencies via `npm ci`):

```bash
npm run format:check   # prettier
npm run lint           # eslint
npm run typecheck      # tsc --noEmit (includes tests)
npm test               # vitest --project unit (jsdom); ~13k tests, several minutes
npm test -- src/components/atoms/Button/Button.test.tsx   # one file
npm test -- -t "snapshot"                                 # one name pattern
npm run test:update-snapshots
npm run test:vrt                       # vitest --project vrt (chromium+firefox+webkit; needs npm run test:vrt:setup once)
npm run test:vrt:check-baselines       # every __screenshots__ folder has a sibling test
npm run build                          # next build --webpack (CI also smoke-tests `next start`)
npm run start:e2e                      # cypress open, interactive
npm run test:e2e                       # cypress run, firefox (needs the full pubky-stack)
```

Right-sized verification:

- A component change → its colocated test + `npm run lint` + `npm run typecheck`.
- A core change → the affected package tests plus typecheck and lint.
- A `runtime-config` / `env` change → `npm test -- src/libs/runtime-config`.
- Anything touching a VRT surface → `npm run test:vrt` and flag the baseline (`visual-regression-testing.md`).
- Run the full `npm test` before handing off a cross-cutting change; `npm run build` when the change is route- or config-wide.
- Cypress e2e needs the full pubky-stack (private `pubky/pubky-stack`) and runs on push to `master`/`dev` in CI. Do not attempt it from a bare checkout, and do not report an e2e result you did not obtain.

Test conventions (full rules: `component-testing.md`): colocated `*.test.tsx`; `describe('<Component>')` plus a separate `describe('<Component> - Snapshots')` with exactly one `expect().toMatchSnapshot()` per test; mobile blocks (`- Mobile Snapshots`) for organisms/templates that use `useIsMobile` directly or through a child, via `setMobileViewport()` / `resetViewport()` from `@/test-utils/viewport`. Mock only network/fs/time/boundaries, keep real implementations of pure helpers, keep Lucide, `@/icons`, `DynamicLucideIcon` and Radix components real, use fake timers for relative time. `as any` and `as unknown as T` are ESLint-banned in tests: use `asInvalid`, `asOpaque`, `mockAuthStore`, `mockSession`, `mockResponse`, `mockKeyboardEvent` from `src/test-utils`.

Manual checks for UI work: desktop and narrow viewport, loading/empty/error states, hover/focus/disabled states, dark-on-brand contrast, and the mobile path where a Sheet replaces a Popover.

## Code Quality

These apply to every diff and are what a reviewer (human or Greptile) checks first.

- **No suppressed lints without a reason.** Every `eslint-disable`, `eslint-disable-next-line`, `@ts-ignore` and `@ts-expect-error` carries an adjacent comment saying why it is needed and what would break without it. If a rule is wrong for a whole file, prefer one top-level `eslint-disable` with rationale over inline ignores.

  ```typescript
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Nexus returns untyped JSON; normalised in PostNormalizer.to
  const data: any = response.body;
  ```

- **No dead code.** Remove unreachable branches, unused variables, commented-out blocks and conditions that are always true or false. Do not comment code out "for later": git keeps history. If a feature flag is permanently on or off, collapse the branch.
- **No unused exports.** A symbol exported but never imported elsewhere is removed or demoted to a local. The only exception is a symbol consumed by an external package or test harness; mark it `// exported for integration tests`.
- **No manual memoization.** The React Compiler (`reactCompiler: true` in `next.config.ts`) memoizes renders and callbacks. `useCallback` / `useMemo` / `React.memo` are added only with a stated reason the compiler cannot handle (a ref-stable callback for a non-React subscriber, or profiler evidence of a hotspot).
- **Scrutinize optional parameters.** A function with 3+ optional parameters that change its behaviour (not just defaults) usually hides several responsibilities. Prefer an options object, explicit overloads or separate functions.
- **No aggregate re-exports.** No `index.ts` / `index.tsx` whose only job is re-exporting, no `src/config/index.ts`; import the defining file through the `tsconfig.json` aliases (`architecture.md`, _Import Path Conventions_; `components.md`, _Imports and Exports_).
- **Change only what the request needs.** No drive-by refactors, renames, reformatting of untouched files, dependency swaps or pattern migrations in the same PR.
- **Never reduce visible behaviour to fix a bug** (counts, actions, states, routes, responsive behaviour), and never edit a `src/config/*` limit to make one component pass.
- **Never edit generated files by hand:** `public/sw.js` (built from `src/sw.ts`), `src/libs/lucide/lucideIcons.{aliases,nodes,tags}.ts` (`lucideIcons.ts` itself is hand-written), `package-lock.json` (let npm write it). CI workflows are hand-maintained but high-risk: change them only when the task is CI.

## Legacy and Removed Patterns

- **i18n is gone** (tracking issue #2305; #2306 made English the only language, #2313 removed the infrastructure and rewrote ~1,000 call sites). New copy is an inline US-English literal at the call site; JSX text with apostrophes stays in a `{'...'}` container. `next-intl`, `messages/`, `src/i18n/`, `useTranslations`, `useFormatter`, `t.rich` must not come back, including as a lookalike "message registry". Duplicated copy across components is accepted. If your branch predates the removal, follow `migrations/2305-i18n-conflict-guide.md` and keep `grep -rn "next-intl\|useTranslations\|@/i18n" src cypress` empty.
- `isPublicRoute` on `usePublicRoute()` is a legacy alias for `isDynamicPublicRoute` (false on `/home`, which is browsable). Use `isCoreExploreRoute` / `isDynamicPublicRoute` / `isPublicExploreRoute`.
- `AppError.type` / `statusCode` / `details` still exist on some paths (phase-2 migration of ADR-0015); new code uses `category` + `code` from `Err.*` factories.
- Some older hooks still hand-roll `useEffect` + `useLiveQuery`; migrate to `useLocalFirstQuery` when you touch one, never copy the old shape.
- ADR-0007 (ascending Dexie migration chain) was never implemented and is superseded by ADR-0019.

## Common AI Failure Modes

- Putting IO (fetch, Dexie) in a component, hook or pipe; calling a service from a controller; calling application from a coordinator.
- Creating a new store, a second data-fetching mechanism, or a parallel error type instead of using Zustand / TanStack / `Err.*`.
- Writing a new button/dialog/input/empty-state/skeleton instead of reusing or extending the atom, molecule or Shadcn primitive that already exists.
- Hardcoded colours, arbitrary Tailwind values, off-scale z-index, new shadow/radius tokens.
- Adding `useMemo` / `useCallback` (the compiler handles it) or a `useEffect` where `useLocalFirstQuery` belongs.
- Interpolating user text into toast copy; styling toasts by `className`.
- Editing generated files, `package-lock.json`, or CI workflows outside a CI task.
- Coercing types in tests with `as any` / `as unknown as T` instead of the `src/test-utils` helpers.
- Treating a local cache hit as proof the data is current, or writing a new freshness mechanism beside TTL (`local-first.md`, _Read pitfalls_).
- Adding a dependency for something already in the tree: `dexie`, `zustand`, `@tanstack/react-query`, `react-hook-form` + `zod`, `radix-ui`, `@dnd-kit/*`, `motion`, `lucide-react`, `lodash-es`, `usehooks-ts`, `react-error-boundary`, `embla-carousel-react`, `react-easy-crop`, `libphonenumber-js`, `qrcode.react`, `jszip`, `@synonymdev/pubky`, `pubky-app-specs`, and `cn`.
- Turning a feature task into a refactor: renaming shared symbols, converting one pattern to another, reformatting untouched files, "fixing" duplication whose two copies serve different features.
- Ignoring composite ids, TTL updates or persistence order, producing local data that looks right and never refreshes.
- Rewriting a route's page file with a whole new layout instead of composing the existing template.

## Decision Heuristics

- If the change is data, start at controllers/application/services; if it is presentation, start at the component and keep it hooked, never IO-aware.
- Before creating a component, search `src/components/**` for an atom/molecule that does it; before a hook, `src/hooks/`; before a helper, `src/libs/**` and `src/core/utils/**`.
- Prefer extending an existing component with a variant (`cva` variant or prop) over forking it; prefer a colocated private component/skeleton over a new shared tier entry, and promote on second use.
- Prefer Nexus reads through `services/nexus` and local-first writes through `application`; never a component-level fetch.
- When changing a shared primitive, grep every consumer first and re-run the affected tests.
- When two patterns exist, follow the one the docs and ADRs name, and check whether the other is legacy before copying it.
- When a request is ambiguous about scope, implement the smallest behaviour-preserving version and state the assumption instead of building a framework.
- When a local defect blocks the work, fix it narrowly and explain why, rather than refactoring around it.
- A stale value, a spinner that never ends or a request storm is a read-path question first: check `useLocalFirstQuery` semantics (cache hit, tombstone, duplicate instances, missing branch) before touching the component that renders it.
- If the fix requires bumping `DB_VERSION` or changing a `src/config/*` limit, stop and raise it: those are product-level decisions, not implementation details.

## Definition of Done

- [ ] Change lives in the correct layer and only there; no boundary crossed.
- [ ] Naming follows controller prefixes and file/type conventions.
- [ ] Reused existing primitive, hook, pipe, config constant; no new dependency without a reason.
- [ ] Errors are `AppError` via `Err.*`; nothing double-logs.
- [ ] No new colours, spacing, z-index values, or unauthorised `useMemo` / `useCallback`.
- [ ] Local-first consequences considered: cache hits, tombstones and missing rows handled on reads; affected rows marked fresh on writes; no second freshness mechanism.
- [ ] No existing visible behaviour silently reduced, and no `src/config/*` limit tuned for a local fix.
- [ ] Imports are concrete alias paths; no barrel files added.
- [ ] Tests at the right level updated/added, including mobile snapshots for viewport-aware organisms.
- [ ] `npm run lint`, `npm run typecheck`, targeted tests pass; `npm run build` when the change is route/config wide.
- [ ] VRT baseline impact flagged to the user; ADR, `DB_VERSION` or config-limit changes called out in the PR.
- [ ] Commit messages and branch name follow `commit-message.md`; the diff contains no unrelated cleanup and reads like the surrounding code.
