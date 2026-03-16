# ADR 0011: Dexie PSD and TanStack Query

## Status

Accepted — 2025-12-14

## Summary

**Problem**

As part of adopting **TanStack Query** across the app, we started integrating it into flows that already used **Dexie** and `useLiveQuery`. During this integration we hit intermittent **Dexie transaction / PSD errors** whenever a `useLiveQuery` callback directly or indirectly triggered TanStack Query:

Dexie uses Promise-Specific Data (PSD) to track transaction context across async calls. TanStack Query's retry mechanism (`fetchQuery`, `useQuery` internals) uses `setTimeout`, which breaks the promise chain. When a `useLiveQuery` callback directly or indirectly triggers TanStack Query (or any similar retry logic), Dexie's PSD context is lost:

- Dexie no longer sees the original transaction as active.
- Subsequent Dexie reads/writes in that logical flow can fail with intermittent, hard-to-reproduce errors.
- The failure only appears when a retry actually happens.

**Decision**

We will:

1. Treat `useLiveQuery` callbacks as **pure, read-only, local-only** functions over IndexedDB.
2. **Never call TanStack Query, other network code, or any retry/timer-based workflows from within `useLiveQuery` callbacks.**
3. Make `useLiveQuery` the **only place in React components and custom hooks that may access local services directly**, and only in a read-only manner. All other UI code must go through controllers.
4. Perform all fetching via **controllers + TanStack Query + `useEffect` (or equivalent)**, and persist results into Dexie. Controller read methods must follow the local-first naming contract (`get*`, `fetch*`, `getOrFetch*`) defined in ADR-0001.
5. Enforce a **persistence order**: entities that are _depended on_ (e.g. authors, tags) are written to IndexedDB **before** entities that reference them (e.g. posts, notifications).

**Goal**

- Keep Dexie's PSD context intact and avoid transaction-related race conditions.
- Maintain a clear separation of concerns:
  - **Fetch & write orchestration**: controllers + TanStack Query.
  - **Reactive reads**: Dexie + `useLiveQuery`.
- Preserve the local-first mental model: UI reads from local storage; background processes keep it fresh.

---

## Context

### Architecture Overview

- **Dexie** is used as an IndexedDB wrapper.
- **`useLiveQuery`** is used to subscribe React components to IndexedDB state.
- **TanStack Query** is used for:
  - Network calls to Nexus and other services.
  - In-memory caching and deduplication.
  - Retry and backoff management.
- The app follows a **local-first** pattern:
  - Writes go to IndexedDB first.
  - UI reacts to local changes via `useLiveQuery`.
  - Background processes synchronize with the network and populate IndexedDB.

This ADR is scoped to flows that involve both Dexie and TanStack Query, especially where a live query might try to perform network or controller logic.

### The Critical Problem: TanStack Query Breaks Dexie's PSD

Dexie tracks transaction context (PSD) as long as code stays within the same promise chain:

```typescript
db.transaction('rw', table, async () => {
  // PSD context starts
  const row = await table.get(id); // OK
  await someAsyncWork(); // OK, same chain
  await table.put(updatedRow); // OK, still in transaction
});
```

But when TanStack Query's retry mechanism fires, it uses `setTimeout`, which moves execution from the microtask queue to the macrotask queue—**breaking the promise chain**:

```typescript
// Inside TanStack Query internals
setTimeout(() => {
  retryFetch(); // New promise chain, PSD context LOST
}, retryDelay);
```

**What happens:**

1. `useLiveQuery` callback executes → establishes PSD context
2. Callback calls controller → triggers TanStack Query
3. TanStack Query encounters error → schedules retry with `setTimeout`
4. Retry fires in new macrotask → **PSD context is gone**
5. Any Dexie operations in that flow fail with `DatabaseError`

**The kicker:** Failures only occur when retries actually happen, making bugs extremely subtle and hard to reproduce.

---

## Related Decisions

- [ADR-0001: Local-First Writes](0001-local-first-writes.md) — The pattern `useLiveQuery` supports
  - [Controller Method Naming Pattern](0001-local-first-writes.md#controller-method-naming-pattern) — `fetch*` vs `get*` vs `getOrFetch*` vs `commit*`
- [ADR-0004: Layering and Dependency Rules](0004-layering-and-dependency-rules.md) — Architectural layers
- [ADR-0008: Coordinators Layer](0008-coordinators-layer.md) — System-initiated workflows

---

## References

- [Dexie PSD Best Practices](https://dexie.org/docs/Tutorial/Best-Practices) — Official Dexie documentation
- [TanStack Query Retry Docs](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries) — Retry mechanism details
