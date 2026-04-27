# Core Architecture (`src/core/`)

This document captures the intent, boundaries, responsibilities, and operating model of `src/core/`.
Based on ADR-0004, ADR-0008, ADR-0009.

For **UI** (`src/components/`, `src/app/`) and related **`src/libs/`** usage such as **icon imports** (stock icons from `lucide-react`, custom SVGs from `@/icons`, URL helpers from `@/libs/utils`), see **`docs/components.md`** — _Icons (Lucide and custom)_.

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

## Layer Responsibilities

### Controllers (`src/core/controllers/`)

- Entry point for user-initiated actions
- Invoke pipes for normalization/validation
- Call application for business logic
- Mutate stores for UI state
- **NEVER** call services directly
- **NEVER** perform IO

### Coordinators (`src/core/coordinators/`)

- Entry point for system-initiated actions
- React to auth, visibility, route changes
- Call controllers (like UI does)
- **NEVER** call application directly
- **NEVER** call services directly

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

- Dexie schema versioning and safe initialization/recovery
- Migration logic

## Allowed Dependencies

```
UI → Controllers (user-initiated actions)
Coordinators → Controllers (system-initiated actions)
Controllers → Pipes, Application, Stores
Application → Pipes, Services (local, homeserver, nexus)
Application → Application (cross-domain, acyclic only, max depth 1)
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

// FORBIDDEN: Max call depth is 1
PostApplication → FileApplication → ImageProcessor  // VIOLATION
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
// Real: src/core/controllers/user/user.ts
class UserController {
  static async commitFollow(eventType, { follower, followee }) {
    const activeStreamId = this.getActiveStreamId(); // Controller reads store
    await UserApplication.commitFollow({ eventType, follower, followee, activeStreamId });
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
class NotificationCoordinator {
  protected async poll() {
    const userId = Core.useAuthStore.getState().selectCurrentUserPubky();
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
│   └── exchangerate/      # Exchange rate service
├── pipes/[domain]/        # Data transformation
├── models/[domain]/       # Dexie tables
├── stores/[domain]/       # UI state (Zustand)
├── database/              # Dexie schema and migrations
├── utils/                 # Utility functions
└── index.ts               # Public API
```

## Architecture Decision Records

ADRs capture the _why_ behind key architectural decisions. Stored in `docs/adr/`.

| ADR  | Title                                  |
| ---- | -------------------------------------- |
| 0001 | Local-first writes                     |
| 0002 | Composite post IDs                     |
| 0003 | Streams as caches                      |
| 0004 | Layering and dependency rules          |
| 0005 | TTL refresh policy                     |
| 0006 | Pipes normalization                    |
| 0007 | Dexie version normalization            |
| 0008 | Coordinators layer                     |
| 0009 | Application cross-domain orchestration |
| 0010 | Notification application orchestration |
| 0011 | Dexie PSD and TanStack Query           |
| 0012 | TTL coordinator                        |
| 0013 | Post stream queue                      |
| 0014 | Muting system                          |
| 0015 | Error handling                         |
| 0016 | Service worker local file cache        |

## Quick Checklist

When adding/modifying code in `src/core/`:

- [ ] Does it respect layer boundaries?
- [ ] Is Application called BY controller, not calling controller?
- [ ] Are Coordinators going through Controllers?
- [ ] Is IO only in Services?
- [ ] Are Pipes pure (no IO)?
- [ ] Does cross-domain call follow ADR-0009 rules?
