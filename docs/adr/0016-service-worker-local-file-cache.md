# ADR 0016: Service Worker for Local File Cache (MVP)

## Status

Accepted — 2026-01-27

## Context

pubky-app aims to be **local-first**: user intent should reflect immediately in the UI, while remote persistence happens in the background.

A concrete pain point is **avatar updates**:

- When a user selects a new avatar file, we want them to see it **instantly** (even on slow networks).
- The actual upload to the homeserver may take time or fail transiently.
- A purely “server-first” image URL means the `<img>` cannot show the new avatar until the upload completes and the server serves it.

We currently have a service worker implementation (`src/sw.ts`) via Serwist, used for runtime caching (e.g. Nexus API) and offline document fallback. This ADR proposes a future extension to that service worker so the app can treat “local user-selected files” as **immediately available** at stable URLs.

### Constraints / assumptions (MVP)

- The “canonical avatar URL” must be within the **service worker scope** and **same-origin** (e.g. an app route like `/avatar/{userId}`), otherwise the SW cannot intercept it.
- The “canonical avatar URL” should be **stable** (avoid random cache-busting query params), because we rely on exact request matching.

### Desired UX and lifecycle

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                           SERVICE WORKER LIFECYCLE                                 │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│   1. REGISTER           2. INSTALL             3. ACTIVATE            4. RUNNING    │
│   ───────────────►      ───────────────►       ───────────────►       ─────────►    │
│                                                                                     │
│   App calls             SW downloads +         SW takes control       SW intercepts │
│   register()            runs install           of the page            fetch events  │
│                         (cache assets)                               (serve cache)  │
│                                                                                     │
└──────────────────────────────────────────────────────────────────────────────────---┘
```

Avatar example:

```
┌─────────────────────────────────────────────────────────────┐
│ User selects new avatar                                      │
├─────────────────────────────────────────────────────────────┤
│ 1. File stored in Cache API (browser storage)                │
│ 2. File uploaded to homeserver (background)                  │
│ 3. <img src="/avatar/{userId}"> renders                      │
│ 4. Service Worker intercepts → serves cached blob            │
│ 5. User sees new avatar INSTANTLY                            │
└─────────────────────────────────────────────────────────────┘
```

## Decision

We will implement a **service-worker-backed local file cache** (avatar-first) using the browser Cache API:

- The app writes a user-selected file (Blob) into a **user-scoped cache** using the **real avatar URL** as the cache key.
- The service worker intercepts requests for avatar URLs and responds from the cache immediately, falling back to network when missing.
- Upload continues in the background; once the server is updated, the cached blob may be replaced or removed (policy below).

This approach substitutes the current/previous “local store approach” for immediate avatar rendering. Instead of relying on in-memory object URLs or app-specific storage access paths, we make the local file available at the same stable URL the UI already uses.

### Key rules (addressing prior concerns)

- **Invalid cache keys**: Use the _actual request URL_ (`/avatar/{userId}` or whatever the UI uses) as the cache key, not ad-hoc keys.
- **Complex SW lookup**: Always resolve with `cache.match(event.request)` (exact request) in the fetch handler.
- **Fragile memory state**: Cache name must be **user-scoped** (e.g. `avatar-cache:${viewerId}`) and cleared on logout.
- **Controller / readiness timing**: App code that depends on the SW must wait for `navigator.serviceWorker.ready` before sending messages or assuming interception. (Note: `ready` does not guarantee the current tab is already controlled; interception may require `clients.claim()`/reload depending on registration timing.)
- **Strict regex**: When matching dynamic path segments, use `([^/?]+)` rather than overly strict patterns like `([a-z0-9]+)`.

### High-level flow

1. **On login / app start**:
   - Ensure service worker is registered/active (existing Serwist setup).
   - Send the current authenticated user scope (viewer id) to the service worker, or otherwise establish the cache namespace for the session.

2. **On avatar selection**:
   - Determine the “canonical avatar URL” used by the app (e.g. `/avatar/{userId}`).
   - Store the blob in Cache API with that URL as the request key.
   - UI re-renders with `<img src="/avatar/{userId}">`; the SW serves the blob.

3. **On logout**:
   - Clear user-scoped caches and any SW-held “current viewer” state.

## Consequences

### Positive ✅

- **Instant perceived updates**: Avatar changes appear immediately without waiting on network round-trips.
- **Unified URL semantics**: UI continues to use stable URLs (no special “local blob URL” plumbing).
- **Offline-friendly**: Recently selected avatars can render offline (within storage limits).

### Negative ❌

- **More moving parts**: Requires SW message passing, cache naming/invalidation, and careful lifecycle handling.
- **Storage constraints**: Cache Storage is quota-limited; blobs may be evicted or fail to write (must handle `QuotaExceededError`).
- **Debugging complexity**: SW caching can obscure “what data is being served” without strong logging/diagnostics.

### Neutral ⚠️

- **Eventual consistency**: The cached avatar may temporarily differ from server truth until upload finishes and caches reconcile.
- **Security model**: Cached blobs must not leak across users on shared devices; thus, clearing on logout is mandatory.

## Acceptance criteria (MVP)

- Selecting a new avatar updates the avatar UI **immediately**, even on slow networks.
- The local avatar persists across **reloads** until invalidated (or until cache eviction), without requiring blob URL plumbing.
- Logout clears any user-scoped avatar cache so avatars don’t **leak across users** on shared devices.
- If Cache API writes fail (quota/policy), behavior is still deterministic (object URL fallback for the session or server-first).

## Current implementation (baseline)

### Avatar preview via `URL.createObjectURL` (today)

When a user selects an avatar, we create an object URL for the file and pass it through the UI so `<img>` can render immediately.

**Strengths**:

- Very simple, immediate rendering.

**Limitations**:

- Not persistent across reloads.
- Requires extra plumbing through the UI/component tree.
- Harder to align with “stable URL” semantics.

**Why we’re changing it**: Too fragile for local-first goals (reload/offline) and doesn’t reuse stable URLs.

## Implementation Notes

### Where this lives

We will extend the existing service worker entrypoint:

- `src/sw.ts`: add a runtime handler for avatar/local-file routes (either via Serwist runtime caching customization or a targeted `fetch` event handler that runs alongside Serwist).

And add small, app-side helpers:

```
src/
  libs/
    serviceWorker/
      register.ts      # registration + readiness helpers (uses navigator.serviceWorker.ready)
      avatarCache.ts   # write/read/clear helpers for avatar blobs (Cache API)
```

> Note: Prior sketches referenced `public/sw.js`. In this repo, `src/sw.ts` is the canonical SW source; build tooling may emit `sw.js` to `public/` as an artifact.

### Fetch interception (avatar-first)

- Intercept requests matching an avatar route (e.g. `/avatar/([^/?]+)`).
- Open the active user-scoped cache (e.g. `avatar-cache:${viewerId}`).
- Return `cache.match(event.request)` if present.
- If missing, fall back to `fetch(event.request)` and (optionally) populate cache based on policy.
  - Prefer implementing this as a Serwist runtime route/handler; only use a manual `fetch` handler if we can guarantee we won’t conflict with other `respondWith` logic.

### Cache invalidation policy (minimum viable)

- **On logout**: delete all `avatar-cache:*` caches.
- **On successful upload**:
  - Either keep the cached blob until next reload (fastest UX), or
  - Replace cache entry with the fresh server response, or
  - Delete cache entry to revert to server authority immediately.

The initial implementation should favor **correctness + privacy**:

- Always clear on logout.
- Prefer replacing/removing the cached entry once the upload is confirmed, if server responses are immediately consistent.

### Error handling expectations

- Cache writes can fail (quota, browser policies). Treat cache as an optimization:
  - If cache write fails, fall back to object URL for the current session or to “server-first” behavior.
- Always prefer **deterministic** behavior:
  - `cache.match(event.request)` rather than partial/derived key matching.

## Related Decisions

- ADR-0001: Local-first writes
- ADR-0004: Layering and dependency rules
- ADR-0015: Centralized error handling architecture
