# Pubky App

Decentralized social app. Tech stack in `package.json`.
Local-first architecture with Dexie (IndexedDB), Zustand, Next.js, Tailwind CSS, Shadcn UI.

## Architecture

Layered architecture in `src/core/` (see `docs/architecture.md` for full details):

```
UI (user actions) → Controllers → Application → Services → Models
Coordinators (system) ↗            ↓              ↓
                       Stores     Pipes         Database
```

Import modules through the path aliases in `tsconfig.json` (for example `@/hooks/*`, `@/controllers/*`, `@/services/*`, `@/models/*`, `@/stores/*`). Keep imports pointed at concrete source modules rather than aggregate re-export files.

### Hard constraints

- Controllers NEVER call Services directly — go through Application
- Coordinators NEVER call Application — go through Controllers
- Application NEVER accesses Stores — only Controllers manage stores
- Pipes are pure — NO IO, NO side effects
- Only PostApplication, NotificationApplication, BootstrapApplication, MigrationApplication, HotApplication, PostStreamApplication, TtlApplication may call other Applications (max depth 1 by default; only PostApplication/NotificationApplication/TtlApplication → PostStreamApplication → FileApplication attachment persistence may reach depth 2; no cycles)

### Controller naming

- `fetch*` — network only, no cache
- `get*` — local only
- `getMany*` — bulk local reads, returns `Map<Pubky, T>`
- `getOrFetch*` — local first, network fallback
- `getMany*OrFetch` — bulk local first, fetch missing (e.g., `getManyTagsOrFetch`)
- `commitCreate*` / `commitUpdate*` / `commitDelete*` — optimistic local write + network sync
- `subscribe*` — long-lived live stream subscription (e.g., homeserver event streams), not a one-shot fetch

### Errors

Use `Err.*` factories (never raw `Error`). Factories log automatically — don't double-log. See `docs/error-handling.md`.

## Key conventions

- Composite post IDs: `author:postId` format
- Local-first writes: Dexie first, homeserver sync in background
- Shadcn First: always check for Shadcn equivalent before building custom UI
- Atomic design: atoms → molecules → organisms → templates
- Components: do not add `index.ts` / `index.tsx` under `src/components` that only re-export children; import concrete component files via `@/atoms/*`, `@/molecules/*`, `@/organisms/*`, or `@/templates/*` (for example `@/atoms/Button/Button`)
- Config: import from `@/config/<module>` (concrete files under `src/config/`). There is no aggregate `src/config/index.ts`.
- App routes: import route enums, maps, and helpers from `@/app/routes` (`src/app/routes.ts`); prefer that over route-only imports through a re-export entrypoint.
- Z-index scale: -z-10, z-10, z-30, z-40, z-50, z-60 (see `docs/z-index.md`)
- **Icons**: stock Lucide from `lucide-react`; custom/brand SVG components from `@/icons` (`src/libs/icons/icons.tsx` via `tsconfig` path alias). URL→icon helpers (`getIconFromUrl`, `getLabelFromUrl`, …) live in `@/libs/utils/urlToIcon` — see `docs/components.md` — _Icons (Lucide and custom)_.
- **Visual regression tests (VRT)**: surfaces with a sibling `*.vrt.test.tsx` (e.g. `src/components/templates/Feed/Home/Home.vrt.test.tsx`) have a pixel baseline checked in under `__screenshots__/`. When you change a UI surface, check whether a VRT exists next to it. If yes, the baseline likely needs regenerating — surface that to the user before reporting the task done. If you're touching a template-level surface that has no VRT yet, mention adding one as an option. The VRT harness lives in `src/test-utils/vrt.tsx`; fixtures in `src/test/fixtures/`; deterministic mocks in `src/test/mocks/`.
- **Forms (standard)**: build new forms with `react-hook-form` + `zod` (via `@hookform/resolvers/zod`). Wrap field components with `Controller` (use the `ControlledInputField` / `ControlledTextareaField` molecules where applicable). Keep the schema + types + defaults in a sibling `*.types.ts` file next to the hook (see `src/hooks/useCreateCollection/useCreateCollection.types.ts` for the canonical layout). Components must not call controllers directly — wrap the mutation in a hook (`use{Action}Form` or `use{Verb}{Entity}`) that returns `{ form, submit, reset, ... }`, where `submit()` returns `Promise<boolean>` so the caller can decide what to do on success (a form hook may instead return the created entity id as `Promise<string | null>` when the caller needs to navigate to it, e.g. `useCreateCollection`). Non-text inputs (file pickers, rich text, etc.) live in their own dedicated hooks (e.g. `useCoverImagePicker`) and the form hook composes them. Schemas carry their user-facing validation messages as literal US English strings.
- **Memoization**: do not add `useCallback` / `useMemo` — the React Compiler (`reactCompiler: true` in `next.config.ts`) handles memoization. Reach for them only after profiling proves the compiler missed something.
- **Toasts**: use `toast()` from `@/molecules/Toaster/use-toast` with `variant` (`default` | `error` | `warning` | `info`). No `showErrorToast` wrappers or `className` destructive hacks. See `docs/components.md` — _Toasts_.

## Learned User Preferences

- Bug fixes must not regress existing visible functionality (e.g., reducing displayed item count from 3 to 2)
- For icon / circular nav matching Figma, confirm active vs inactive from the Shadcn button component variants (Selected vs Default: background, border, shadow), not only the parent frame or another surface’s pattern

## Learned Workspace Facts

- Nav items that link to a default child route (e.g. footer Settings → `SETTINGS_ROUTES.ACCOUNT`) but must stay visually active on sibling routes under the parent (e.g. `/settings/notifications`) need active detection on a broader prefix (e.g. `activePrefix: APP_ROUTES.SETTINGS`), not only `href` or `pathname.startsWith(href + '/')`
- Config constants in `src/config/` (e.g., `USER_LIST_TAGS_MAX_TOTAL_CHARS`, tag limits) are project-wide hard limits — do not modify them for individual component fixes
- This project uses Zod v4 — use `z.url()` for URL validation, not the deprecated `z.string().url()`
- PWA / service worker: Serwist via `@serwist/next` in `next.config` (core package `serwist`), not Workbox or `next-pwa`

## Documentation

Consult `docs/` before making changes:

- `src/core/` changes → `docs/architecture.md`, `docs/local-first.md`, `docs/error-handling.md`, `docs/data-patterns.md`
- `src/components/` changes → `docs/components.md`, `docs/z-index.md`, `docs/component-testing.md`, `docs/skeleton-architecture.md`
- `src/libs/env/` changes → `docs/environment.md`
- Commits → `docs/commit-message.md`
- Architecture decisions → `docs/adr/`
