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
- Only PostApplication, NotificationApplication, BootstrapApplication, HotApplication, PostStreamApplication, TtlApplication may call other Applications (max depth 1, no cycles)

### Controller naming

- `fetch*` — network only, no cache
- `get*` — local only
- `getMany*` — bulk local reads, returns `Map<Pubky, T>`
- `getOrFetch*` — local first, network fallback
- `getMany*OrFetch` — bulk local first, fetch missing (e.g., `getManyTagsOrFetch`)
- `commitCreate*` / `commitUpdate*` / `commitDelete*` — optimistic local write + network sync

### Errors

Use `Err.*` factories (never raw `Error`). Factories log automatically — don't double-log. See `docs/error-handling.md`.

## Key conventions

- Composite post IDs: `author:postId` format
- Local-first writes: Dexie first, homeserver sync in background
- Shadcn First: always check for Shadcn equivalent before building custom UI
- Atomic design: atoms → molecules → organisms → templates
- Z-index scale: -z-10, z-10, z-30, z-40, z-50, z-60 (see `docs/z-index.md`)
- **Icons**: stock Lucide from `lucide-react`; custom/brand SVG components from `@/icons` (`src/libs/icons/icons.tsx` via `tsconfig` path alias). URL→icon helpers (`getIconFromUrl`, `getLabelFromUrl`, …) live in `@/libs/utils/urlToIcon` — see `docs/components.md` — _Icons (Lucide and custom)_.

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
