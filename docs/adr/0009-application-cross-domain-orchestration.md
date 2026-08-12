# ADR 0009: Application Layer Cross-Domain Orchestration

## Status

Accepted — 2025-11-21

## Context

Complex user workflows often require coordinating operations across multiple domains. For example, creating a post with file attachments and tags involves three distinct domain operations:

1. **File upload** (FileApplication)
2. **Post creation** (PostApplication)
3. **Tag association** (TagApplication)

These operations must be orchestrated as a single cohesive workflow with proper ordering (files before post, post before tags) and explicit partial-failure handling.

Under the current architecture (ADR-0004), the allowed dependencies are:

```
UI → Controllers → Application → Services
```

This creates a design challenge:

- **Controllers can only call Application** (not other Controllers)
- **Application can only call Services** (no cross-Application calls documented)
- **No cross-domain orchestration layer exists**

This forces a choice between three unsatisfactory approaches:

1. **UI orchestration**: Have UI components coordinate multiple controller calls, leaking business logic into the presentation layer
2. **Duplication**: Duplicate file upload and tag creation logic inside PostApplication, violating DRY principles
3. **Service bypass**: Have controllers call services directly, bypassing the Application orchestration layer

None of these approaches align with clean architecture principles.

The fundamental issue: **Where does cross-domain orchestration belong?**

## Decision

**Allow Application layer classes to call other Application layer classes** for workflow orchestration, with the following constraints:

### Core Rules

1. **Horizontal calls permitted**: Applications with orchestration privilege MAY call other Application classes within the same layer
2. **Acyclic dependency graph**: Circular dependencies between Application classes are FORBIDDEN
3. **Maximum call depth of 1 by default**: If Application A calls Application B, then B MUST NOT call another Application within that execution flow. The only permitted depth-2 paths start from `PostApplication`, `NotificationApplication`, or `TtlApplication`, continue through `PostStreamApplication`, and end at `FileApplication` for attachment persistence inside `fetchMissingPostsFromNexus()` or `fetchOriginalPostsByUris()`. All other depth-2 paths and every path of depth 3 or greater are FORBIDDEN.
4. **Orchestration privilege**: Only the Applications listed below may call other Application classes. All other Application classes (`FileApplication`, `TagApplication`, `BookmarkApplication`, `UserApplication`, etc.) MUST NOT call other Application classes. This keeps specialized domains independent and prevents reverse dependencies on core orchestrators.

#### Allowed orchestrators

| Application               | Why privilege exists                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `PostApplication`         | Single user action spans files, tags, and related posts (create / edit / delete / replies).                                        |
| `NotificationApplication` | Hydrates referenced posts/users before notification persistence; see [ADR-0010](./0010-notification-application-orchestration.md). |
| `BootstrapApplication`    | Session startup must hydrate multiple homeserver/Nexus domains in one coordinated fan-out. **Root-node** orchestrator (see below). |
| `MigrationApplication`    | After DB recreation, critical homeserver-backed state must be re-synced once. **Root-node** orchestrator (see below).              |
| `HotApplication`          | Hot-tag UI needs tagger profiles cached before tags are written, to avoid liveQuery flashes with missing users.                    |
| `PostStreamApplication`   | Stream slices include attachment metadata that must land in the file domain when posts are persisted.                              |
| `TtlApplication`          | Force-refresh of stale posts must also persist attachments and hydrate embedded original posts for reposts.                        |

#### Root-node orchestrators

`BootstrapApplication` and `MigrationApplication` are **source nodes (in-degree 0)** in the Application dependency DAG: Controllers invoke them, and no Application may call them, preventing cycles through these roots. Their current execution paths stop after one cross-Application hop, so they remain at depth 1.

### Example

```
// ✅ Depth 1 — allowed orchestrator → helper
PostApplication → FileApplication
PostApplication → TagApplication

// ✅ Depth 2 — only permitted attachment-persistence exception
PostApplication | NotificationApplication | TtlApplication
  → PostStreamApplication
    → FileApplication

// ❌ Forbidden
FileApplication → TagApplication          // helper → other Application
HotApplication → PostStreamApplication → FileApplication   // depth 2 outside the exception
A → B → C → D                              // depth ≥ 3
A → B → A                                  // cycle
```

### Enforcement Strategy

⚠️ **Critical Limitation**: Our architecture uses **static classes without dependency injection**. Therefore:

- ✅ Dependencies are explicit in code (searchable)
- ❌ Dependencies are NOT visible in type signatures
- ❌ Circular dependencies are NOT caught at compile time
- ❌ Call depth is NOT enforced by TypeScript

**We rely on:**

1. **Code Reviews**: Reviewers MUST check for circular dependencies, the call-depth rule and its single explicit exception, orchestration privilege (Allowed orchestrators table), and the root-node invariant (no Application may call `BootstrapApplication` or `MigrationApplication`)
2. **Automated Review**: The `cross-domain-app-restriction` rule in `.greptile/config.json` mirrors the allowlist and call-depth constraints
3. **Documentation**: This ADR is the source of truth

**Future Tooling** (optional, not required now):

- dependency-cruiser for circular dependency detection
- Custom ESLint rules for call depth validation
- Type-level dependency tracking (TypeScript 5.x features)

### Guidelines for Use

**When TO use cross-Application calls:**

- ✅ Single user action requires multi-domain coordination
- ✅ Complex workflow with ordering or explicit partial-failure handling
- ✅ Avoiding code duplication of orchestration logic
- ✅ Only from an **allowed orchestrator** (rule 4)

**When NOT to use:**

- ❌ Simple read operations (use services directly)
- ❌ Single-domain workflows (stay within one Application)
- ❌ Deep processing chains outside the explicit depth-2 attachment-persistence exception (refactor to flatten)
- ❌ From Applications **without** orchestration privilege (rule 4)

## Consequences

### Positive ✅

- **Proper orchestration location**: Cross-domain workflows stay in Application layer (not UI, not Services)
- **Code reuse**: Avoid duplicating file upload, tag creation logic across Application classes
- **Single responsibility preserved**: Each Application class maintains its domain focus
- **Testability**: Can mock cross-Application dependencies in unit tests
- **Matches orchestration role**: Application layer is ALREADY responsible for orchestrating services; this extends to orchestrating other applications

### Negative ❌

- **Increased coupling**: Application classes now depend on each other
- **Hidden dependencies**: Static classes don't declare dependencies in signatures
- **Review burden**: Code reviewers must manually verify architectural constraints
- **Testing complexity**: More mocking required (mock cross-Application calls)

### Neutral ⚠️

- **Requires discipline**: Team must enforce rules through reviews and testing
- **Documentation-heavy**: Constraints live in docs, not code
- **Potential for misuse**: Easy to create deep chains or circular dependencies if not careful
- **Future refactor possible**: Could move to dependency injection later for compile-time enforcement

## Alternatives Considered

### Alternative 1: Full Dependency Injection Refactor

Move from static Application classes to instance-based classes with constructor injection.

**Pros**: Explicit dependencies in constructors; a composition root or DI container can detect cycles; easier mocking; possible typed call-depth enforcement.

**Cons**: Large refactor across Controllers / Applications / Services; DI container or manual wiring; more boilerplate and init complexity; little immediate product value.

**Why not chosen**: Scope is too large for the immediate problem. Reconsider if privilege violations become frequent or code review alone cannot enforce the rules.

### Alternative 2: UI Orchestration

Have React components sequence multiple controller calls (upload files → create post → add tags).

**Pros**: No Application-layer change; domains stay separate at the controller boundary; flow is easy to read in one place.

**Cons**: Business workflow leaks into presentation; ordering/error handling scatters across components; hard to reuse for non-UI flows (bootstrap, migration, TTL).

**Why not chosen**: Cross-domain orchestration belongs in the Application layer, not the UI.

### Alternative 3: Controller-Level Orchestration

Have Controllers call several Application classes in sequence for one user/system action, with no Application→Application calls.

**Pros**: Keeps Application classes independent; Controllers already sit above Application; easy to follow from an entry point.

**Cons**: Places cross-domain business ordering alongside Controller concerns such as session and store management. Other Applications cannot reuse the workflow without duplicating it or introducing a forbidden Application → Controller dependency.

**Why not chosen**: Cross-domain business invariants belong in Application. Controllers select workflows and reconcile their results with UI state. They may sequence Applications for controller-owned session or store coordination, but must not own reusable cross-domain business invariants.

### Alternative 4: Duplicate Orchestration Logic

Inline file/tag/stream logic inside each orchestrating Application instead of calling peer Applications.

**Pros**: No cross-Application dependencies; each Application is fully self-contained; easy to reason about in isolation.

**Cons**: Duplicates domain rules; changes must be made in multiple places; implementations drift; larger bug surface.

**Why not chosen**: Prefer one Application owning its domain and being called by an allowed orchestrator.

## Related Decisions

- **ADR-0004: Layering and Dependency Rules** — Establishes base layer flow that this ADR extends.
- **ADR-0010: Notification Application Cross-Domain Orchestration Privilege** — Adds a constrained exception for `NotificationApplication` orchestration.
