# Core Architecture (`src/core/`)

This document captures the intent, boundaries, responsibilities, and operating model of `src/core/`.
Based on ADR-0004, ADR-0008, ADR-0009.

For **UI** (`src/components/`, `src/app/`) and related **`src/libs/`** usage such as **icon imports** (stock icons from `lucide-react`, custom SVGs from `@/icons`, URL helpers from `@/libs/utils/urlToIcon`), see **`docs/components.md`** — _Icons (Lucide and custom)_.

## Layer Flow

```
UI (user actions) ──────┐
                        ↓
Coordinators (system) ─→ Controllers → Application → Services → Models
                         ↓              ↓             ↓
                         Stores         Pipes         Database
```

## Entry Points

Only these can initiate workflows:

| Entry Point      | Trigger                                  | Calls       |
| ---------------- | ---------------------------------------- | ----------- |
| **UI**           | User actions (clicks, forms)             | Controllers |
| **Coordinators** | System events (timers, auth, visibility) | Controllers |

## Import Path Conventions

Modules are imported directly through the path aliases in `tsconfig.json`. Keep imports pointed at concrete source modules rather than aggregate re-export files.

**App configuration** lives under `src/config/`: import from `@/config/<module>` (for example `@/config/nexus`). Do not add `src/config/index.ts` that re-exports the entire config surface.

**Route constants and helpers** live in `src/app/routes.ts`: import from `@/app/routes` (named imports; use `import type` when a colocated `*.types.ts` file only contributes types).

| Layer        | Alias              |
| ------------ | ------------------ |
| Hooks        | `@/hooks/*`        |
| Application  | `@/application/*`  |
| Controllers  | `@/controllers/*`  |
| Coordinators | `@/coordinators/*` |
| Database     | `@/database/*`     |
| Models       | `@/models/*`       |
| Pipes        | `@/pipes/*`        |
| Services     | `@/services/*`     |
| Stores       | `@/stores/*`       |

## Layer Responsibilities

### Controllers (`src/core/controllers/`)

- Entry point for user-initiated actions
- Invoke pipes for normalization/validation
- Call application for business logic
- Mutate stores for UI state
- Use `subscribe*` only for long-lived live stream subscriptions; keep SDK lifecycle details below the controller boundary
- **NEVER** call services directly
- **NEVER** perform IO

### Coordinators (`src/core/coordinators/`)

- Entry point for system-initiated actions
- React to auth, visibility, route changes
- Call controllers (like UI does)
- **NEVER** call application directly
- **NEVER** call services directly
- **Mute list (homeserver events stream)**: `MuteListSyncCoordinator` (`src/core/coordinators/mute-list-sync/`) refreshes the local mute list when another session changes `/pub/pubky.app/mutes/`; see `docs/adr/0014-muting-system.md`.

### Application (`src/core/application/`)

- Orchestrate business workflows
- Called BY controllers — **NOT an entry point**
- Call services for IO
- Can call other Applications (with restrictions — see below)
- **NEVER** access stores directly
- **NEVER** call controllers

### Services (`src/core/services/`)

- IO boundaries
- `local/` — Dexie persistence and cache integrity
- `homeserver/` — Network writes (PUT/POST/DELETE)
- `nexus/` — Network reads
- `homegate/` — Homegate API
- `chatwoot/` — Chatwoot integration
- `exchangerate/` — Exchange rate service
- `nextjs/` — Server-only work (OG-metadata scraping for link previews, Next.js route-handler helpers)
- **NEVER** call application or controllers
- **NEVER** access stores

### Pipes (`src/core/pipes/`)

- Normalize and validate data
- Transform external shapes to domain shapes via `pubky-app-specs`
- Pure functions only
- **NEVER** perform IO
- **NEVER** access database or network

### Models (`src/core/models/`)

- Dexie-based persistence only
- CRUD operations on IndexedDB
- **NEVER** perform network calls
- **NEVER** access stores

### Stores (`src/core/stores/`)

- Global UI state via Zustand
- No business logic

### Database (`src/core/database/`)

- Single Dexie schema version (`DB_VERSION`), safe initialization and recovery
- A version mismatch deletes and recreates the database; there is no migration chain (ADR-0019, `docs/data-patterns.md` — _Schema changes_)

## Allowed Dependencies

```
UI → Controllers (user-initiated actions)
Coordinators → Controllers (system-initiated actions)
Controllers → Pipes, Application, Stores
Application → Pipes, Services (local, homeserver, nexus, homegate, chatwoot, exchangerate, nextjs)
Application → Application (cross-domain, acyclic, max depth 1 by default; see ADR-0009 for the depth-2 attachment-persistence exception)
Services:
  local → Models
  homeserver → network only
  nexus → network only
Models → Dexie only (no network, no stores)
Pipes → no IO; transform only
```

**Key Rule:** Application is called BY controllers, never calls them back. Unidirectional flow.

## Application Cross-Domain Rules (ADR-0009)

Only these Applications can call other Applications:

- `PostApplication`
- `NotificationApplication`
- `BootstrapApplication`
- `MigrationApplication`
- `HotApplication`
- `PostStreamApplication`
- `TtlApplication`

### Restrictions

```typescript
// ALLOWED: PostApplication (orchestrator) calls helper applications
// Real: src/core/application/post/post.ts
static async commitCreate({ postUrl, compositePostId, post, fileAttachments, tags }) {
  await FileApplication.commitCreate({ fileAttachments });
  await TagApplication.commitCreate({ tagList: tags });
}

// FORBIDDEN: Helper applications cannot call others
// FileApplication is a helper — it must not call other applications
static async commitCreate({ fileAttachments }) {
  await TagApplication.commitCreate(...); // VIOLATION
}

// FORBIDDEN: No circular dependencies
PostApplication → FileApplication → PostApplication  // VIOLATION

// ONLY ALLOWED DEPTH-2 PATHS: attachment persistence via PostStreamApplication
PostApplication | NotificationApplication | TtlApplication
  → PostStreamApplication
    → FileApplication

// FORBIDDEN: Every other depth-2 path and all paths of depth 3 or greater
PostApplication → FileApplication → ImageProcessorApplication  // VIOLATION
```

Since the architecture uses static classes without dependency injection, these constraints **cannot be enforced at compile time**. They are enforced through code reviews and documentation. See ADR-0009.

## Anti-Patterns

### Controller calling Service directly

```typescript
// BAD — controller bypasses application layer
class PostController {
  static async commitCreate(params) {
    await LocalPostService.create(post); // Bypass application
  }
}

// GOOD — controller delegates to application
// Real: src/core/controllers/post/post.ts
class PostController {
  static async commitCreate(params) {
    const { post, meta } = await PostNormalizer.to(postData, authorId);
    await PostApplication.commitCreate({ compositePostId, post, postUrl: meta.url });
  }
}
```

### Application accessing Store

```typescript
// BAD — application reaches into UI state
class PostApplication {
  static async commitCreate(params) {
    usePostStore.getState().setLoading(true); // VIOLATION
  }
}

// GOOD — controller manages store, application handles IO
// Real: src/core/controllers/stream/posts/posts.ts
class StreamPostsController {
  static async getOrFetchStreamSlice(params) {
    const viewerId = useAuthStore.getState().currentUserPubky; // Controller reads store
    return await PostStreamApplication.getOrFetchStreamSlice({ ...params, viewerId });
  }
}
```

### IO in Pipes

```typescript
// BAD — pipe performs IO
class PostNormalizer {
  static async normalize(post) {
    const user = await LocalUserService.readDetails(post.author); // IO!
  }
}

// GOOD — pipe is pure transformation
// Real: src/core/pipes/user/user.normalizer.ts
class UserNormalizer {
  static to({ name, bio, image, links, status }, pubky) {
    const builder = PubkySpecsSingleton.get(pubky);
    return builder.createProfile(name, bio, image, links, status);
  }
}
```

### Coordinator calling Application directly

```typescript
// BAD — coordinator bypasses controller
class NotificationCoordinator {
  protected async poll() {
    await NotificationApplication.fetchNotifications({ userId }); // Bypass controller
  }
}

// GOOD — coordinator goes through controller
// Real: src/core/coordinators/notifications/notifications.ts
import { useAuthStore } from '@/stores/auth/auth.store';

class NotificationCoordinator {
  protected async poll() {
    const userId = useAuthStore.getState().selectCurrentUserPubky();
    await NotificationController.fetchNotifications({ userId }); // Through controller
  }
}
```

## IO Boundaries

### Inbound (entry points)

- **Controllers** (called by UI): Accept user intent, validate via pipes, invoke application, update stores.
- **Coordinators** (called by system): React to system events, call controllers.

### Outbound (to the outside world)

- `services/homeserver`: Session/auth, HTTP writes, blob uploads, auth URL creation, signup tokens.
- `services/nexus`: HTTP reads for bootstrap, streams, users, posts, tags, search, files. Pagination and stop semantics.
- `services/local`: Exclusive interface to Dexie models. Multi-table consistency, stream cache integrity, local-first writes with eventual consistency.

## File Organization

```
src/core/
├── controllers/[domain]/  # Entry points for UI
├── coordinators/[domain]/ # Entry points for system
├── application/[domain]/  # Business logic orchestration
├── services/
│   ├── local/[domain]/    # Dexie operations
│   ├── homeserver/        # Network writes
│   ├── nexus/[domain]/    # Network reads
│   ├── homegate/          # Homegate API
│   ├── chatwoot/          # Chatwoot integration
│   ├── exchangerate/      # Exchange rate service
│   └── nextjs/            # Server-only helpers (OG metadata)
├── pipes/[domain]/        # Data transformation
├── models/[domain]/       # Dexie tables
├── stores/[domain]/       # UI state (Zustand)
├── database/              # Dexie schema (single version, recreated on mismatch)
└── utils/                 # Utility functions
```

## High-Risk Areas

Trace call sites and mirror the existing pattern before changing any of these. No opportunistic refactors.

- `src/core/database/franky/franky.ts` + `src/config/database.ts` — one `this.version(DB_VERSION).stores({...})` definition. A `DB_VERSION` mismatch deletes and recreates the local database (`recreateDatabase`), i.e. user-visible local data loss until the next sync. Bumping the version or editing a table's index map is a deliberate, reviewed change with its own callout in the PR, never a side effect of a feature (ADR-0019).
- `src/core/services/homeserver/**` and `src/core/pipes/**` — wire-format boundaries (`pubky-app-specs`, composite ids, signup tokens, auth URLs). Preserve payload shapes; do not change a format incidentally while adding a feature.
- `src/core/services/local/**` — writer of Dexie + TTL invariants; getting the order wrong corrupts caches silently. Persist dependencies before dependents, refresh `*_ttl` rows on every write, and use the dirty registry rather than deleting stream rows eagerly (`docs/local-first.md`).
- `src/core/application/**` cross-domain calls — verify the ADR-0009 allow-list above before wiring two Applications together.
- `src/libs/env/env.ts` + `src/libs/runtime-config/**` — the only places allowed to read `process.env.NEXT_PUBLIC_*` / `process.env.PUBKY_RUNTIME_*` (ESLint-enforced). Runtime config is injected into the browser as `window.__PUBKY_CONFIG__`, so never put a secret there (`docs/environment.md`).
- `src/libs/{password,identity,phone}`, `src/components/organisms/{Backup,DialogBackup*,DialogRestore*,Human*}` — cryptographic, identity and onboarding-verification flows.
- `src/core/services/nextjs/og-metadata/**` + `src/libs/network/network.ts` — server-side fetching of user-supplied URLs for link previews, deliberately SSRF-guarded (`checkDnsSafety`, `isIpSafe`, DNS-rebinding checks). Any change here is a security change: keep the guards and their tests intact.
- `src/sw.ts`, `next.config.ts`, `src/instrumentation*.ts`, `src/sentry.*.config.ts`, `.github/workflows/**` — build and runtime plumbing with cross-cutting effects. Change them only when the task is about them; `public/sw.js` is generated from `src/sw.ts`, never edit it by hand.

## Architecture Decision Records

ADRs capture the _why_ behind key architectural decisions. Stored in `docs/adr/`.

| ADR  | Title                                                                     |
| ---- | ------------------------------------------------------------------------- |
| 0001 | Local-first writes                                                        |
| 0002 | Composite post IDs                                                        |
| 0003 | Streams as caches                                                         |
| 0004 | Layering and dependency rules                                             |
| 0005 | TTL refresh policy                                                        |
| 0006 | Pipes normalization                                                       |
| 0007 | Dexie version normalization                                               |
| 0008 | Coordinators layer                                                        |
| 0009 | Application cross-domain orchestration                                    |
| 0010 | Notification application orchestration                                    |
| 0011 | Dexie PSD and TanStack Query                                              |
| 0012 | TTL coordinator                                                           |
| 0013 | Post stream queue                                                         |
| 0014 | Muting system                                                             |
| 0015 | Error handling                                                            |
| 0016 | Service worker local file cache                                           |
| 0017 | Runtime config injection                                                  |
| 0018 | Optional runtime-config tier, runtime Sentry, decoupled source-map upload |
| 0019 | Dexie schema changes recreate the local database                          |
| 0020 | Local-first tag cache and viewport lifetimes                              |
| 0021 | Service worker scope and update policy                                    |

## Quick Checklist

When adding/modifying code in `src/core/`:

- [ ] Does it respect layer boundaries?
- [ ] Is Application called BY controller, not calling controller?
- [ ] Are Coordinators going through Controllers?
- [ ] Is IO only in Services?
- [ ] Are Pipes pure (no IO)?
- [ ] Does cross-domain call follow ADR-0009 rules?
