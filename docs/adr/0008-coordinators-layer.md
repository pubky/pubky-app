# ADR 0008: Coordinators Layer

## Status

Accepted — 2024-11-19  
Updated — 2026-01-01

## Context

We need to implement notification polling: periodically fetching new notifications from the server to keep the UI updated. This represents a **system-initiated workflow** that doesn't fit cleanly into existing layers defined by ADR-0004.

The notification polling feature needs to:

- React to system state changes (auth, page visibility, routes)
- Coordinate periodic actions autonomously (polling every 20 seconds)
- Initiate workflows when conditions are met (fetch notifications)
- Manage lifecycle of background behaviors (start/stop based on state)

Analyzing where this belongs in the existing architecture:

- **Not a Service**: Services handle IO boundaries (network, database), not workflow coordination or lifecycle management
- **Not Application**: Application orchestrates business logic but is called BY controllers, not an entry point
- **Not a Controller**: Controllers are entry points for user-initiated actions from the UI, not system events

The challenge: polling needs to **call controllers** (like UI does) but is triggered by **system events** (timers, auth changes), not user actions. ADR-0004 only defines UI as an entry point to controllers.

Without a proper layer for system-initiated coordination:

- No clear architectural home for polling logic
- Risk of architectural violations if forced into existing layers (e.g., services calling controllers)
- No established pattern for future system-level behaviors (stream refresh, TTL sync, cache warming, scheduled cleanup)

## Decision

Create a new **Coordinators layer** (`src/core/coordinators/`) for system-initiated coordination that parallels UI as an entry point to controllers.

### Architecture

```
Entry Points → Controllers → Application → Services
     ↓              ↓             ↓
UI (user)      Orchestrate   IO Boundaries
Coordinators   Workflows
(system)
```

**Key principles:**

1. **Coordinators = System-initiated entry points**
   - React to system events (timers, auth changes, visibility, routes)
   - Call controllers to initiate workflows
   - Manage autonomous behavior lifecycles

2. **Parallel to UI, not subordinate**
   - Both UI and Coordinators call controllers
   - Controllers remain unaware of their caller
   - Unidirectional flow: Entry Points → Controllers → Application → Services

3. **Organized by domain, not mechanism**
   - `coordinators/notifications/` (not `coordinators/polling/`)
   - `coordinators/streams/` for stream refresh coordinator
   - `coordinators/ttl/` for TTL sync coordinator

4. **Application layer clarification**
   - Application is **NOT an entry point**
   - Application is **called BY controllers** (who are called by UI/Coordinators)
   - Application orchestrates but never calls back to controllers

### Implementation

- Created: `src/core/coordinators/notifications/NotificationCoordinator`
- Implemented: Polling lifecycle management (start/stop based on auth, visibility, routes)
- Integrated: Calls `NotificationController.fetchNotifications()` to fetch notifications
- UI Component: `CoordinatorsManager` manages coordinator lifecycle
- Consumed via direct alias imports, for example `@/coordinators/notifications/notifications`

## Consequences

### Positive ✅

- **Clear separation of concerns**: UI handles user actions, Coordinators handle system actions
- **Architectural consistency**: Both entry points follow same pattern (call controllers)
- **Enables future coordinators**: Pattern established for stream refresh, TTL sync, cache warming, scheduled cleanup
- **Application layer clarified**: Explicitly documented as workflow orchestrator, not entry point
- **No violations**: Coordinators calling controllers is architecturally valid
- **Scalable pattern**: Easy to add new system-initiated behaviors

### Negative ❌

- **New layer complexity**: Developers must understand another layer in the architecture
- **Layer proliferation**: More folders/structure to navigate

### Neutral ⚠️

- **Requires documentation**: Must clearly explain when to use Coordinators vs Controllers vs Application
- **Naming matters**: Must organize by domain (notifications, streams) not mechanism (polling, timers)
- **Lifecycle management**: Coordinators typically managed by React components (e.g., `CoordinatorsManager`)

## Alternatives Considered

### Alternative 1: Keep in Services

**Description**: Accept services calling controllers as valid for polling use cases.

**Pros**:

- No new layer to learn
- Minimal changes to architecture
- Polling stays where it is

**Cons**:

- Violates ADR-0004 layering rules
- Creates confusion about service responsibilities
- No clear pattern for future system behaviors
- Services would have mixed concerns (IO + coordination)

**Why not chosen**: Architectural consistency and clean boundaries more important than avoiding a new layer.

### Alternative 2: Move to Application Layer

**Description**: Make Application layer accessible from both Controllers and system events.

**Pros**:

- No new layer needed
- Application already orchestrates workflows

**Cons**:

- Application loses its clear "orchestrator" role
- Becomes entry point AND orchestrator (mixed concern)
- Confuses the unidirectional flow: who calls Application?
- No place to manage lifecycle of system behaviors

**Why not chosen**: Would muddy the clean separation between entry points (Controllers) and orchestration (Application).

### Alternative 3: Workers Layer

**Description**: Create `src/core/workers/` for background task execution and system-initiated behaviors.

**Pros**:

- Immediately recognizable to developers familiar with worker patterns
- Clearly conveys "background" execution
- Well-established naming convention

**Cons**:

- Typically implies task queues and job processing (async work queues)
- "Worker" usually processes tasks from a queue, not coordinates system state
- Less clear about the "entry point" nature and calling controllers
- Could be confused with Web Workers or Service Workers in browser context

**Why not chosen**: While intuitive, "workers" implies a job queue/processing model rather than the reactive, state-driven coordination we need. Our polling doesn't process queued tasks—it reacts to system state and calls controllers directly.

## Implementation Notes

### File Structure

```
src/core/coordinators/
├── notifications/
│   ├── notifications.ts        # NotificationCoordinator
│   ├── notifications.types.ts
│   └── notifications.test.ts
```

### Future Coordinators

Patterns established for:

- **StreamCoordinator**: Refreshes cached streams on intervals or staleness
- **TtlCoordinator**: Expires stale cache entries based on TTL policies
- **SyncCoordinator**: Background sync for offline changes
- **CleanupCoordinator**: Scheduled cleanup of old data

## Related Decisions

- **ADR-0004: Layering and Dependency Rules** — Coordinators extend the layering model with a new entry point type
- **ADR-0001: Local-First Writes** — Coordinators enable background sync without blocking UI
- **ADR-0012: TTL Coordinator** — Implements the TtlCoordinator pattern for viewport-aware data refresh
