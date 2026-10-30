# ADR 0021: Service Worker Scope and Update Policy

## Status

Accepted — 2026-09-15  
Updated — 2026-10-30 (one-release exception for the social v1 cut-over: forced worker takeover, reverted in the
following release; see _Amendment_)

## Context

The service worker (`src/sw.ts`, Serwist) was added with a `NetworkFirst` runtime cache for Nexus, `skipWaiting` + `clientsClaim`, and an `/offline` fallback. In practice: the fallback never fired (Serwist attaches fallbacks to runtime-caching handlers only, and the app never registered a navigation route); the Nexus cache regex only matched the staging host and, where it matched, handed the app a stale response that the TTL layer then recorded as fresh; every deploy silently activated the new worker in open tabs, evicting chunks those tabs still needed; the injected `reloadOnOnline` handler hard-reloaded the page on every network flap; and the precache pulled all of `public/` (~43 MB, including a 20 MB video) on first visit.

The app is local-first: Dexie is the data cache, TTL is the freshness mechanism, and homeserver writes go through the WASM SDK with a cross-origin cookie the worker cannot see. Session restore on a fresh load revalidates with the homeserver and wipes local state on failure, so anything that boots the app while offline logs the user out.

## Decision

- **The worker owns the app shell only.** It precaches `_next/static` plus an allow-list of `public/` files, handles the OS share target, and serves a static offline page for failed navigations. It has no other runtime caching: no `defaultCache`, no host- or path-based data caches. Homeserver, pkarr, httprelay, Nexus and the CDN are never intercepted.
- **Updates are user-consented.** (One recorded exception: the social v1 cut-over release, see _Amendment_.)
  `skipWaiting: false`; the app registers the worker itself (`register: false`, `ServiceWorkerRegistrationProvider`, which also keeps a rejected registration out of Sentry) and `useServiceWorkerUpdate` drives the flow from the browser's registration API: one persistent, dismissible "Update available" toast per waiting worker, `SKIP_WAITING` on Reload, and a reload of the accepting tab only. Other tabs are claimed too (`clientsClaim` stays on so the first install takes effect immediately) but are offered a reload rather than forced into one.
- **The offline fallback is a static file.** `public/offline.html` is precached and served by Serwist's `fallbacks` behind a `NetworkOnly` navigation route. It never boots the app.
- **The network is not a reason to reload.** `reloadOnOnline: false`; the UI shows offline / online toasts instead.
- **`public/` precaching is an allow-list** (`globPublicPatterns`), because public entries bypass Serwist's size limit and `exclude`.

## Amendment — social v1 cut-over (one release only)

The release that moves the app from `pubky-app-specs` 0.x to `pubky-social-specs` 1.x (`/pub/social/v1/`,
ADR-0026) changes what the client writes to the homeserver. A page still running the previous bundle keeps
writing the retired `/pub/pubky.app/` tree until it reloads, and nothing server-side reaches an already-open
page: runtime config is memoized per load, the old bundle reads no version gate, and a same-profile old tab
even adopts the new grant through the `storage` event. The service worker lifecycle is the only channel that
reloads an old page without its consent and without changing old code.

For that one release, `src/sw.ts` ships with:

- `skipWaiting: true`: the new worker activates as soon as it installs instead of waiting for the "Update
  available" toast.
- an `activate` listener that, when the worker replaces an earlier one (`self.registration.active` was set
  during `install`), awaits `self.clients.claim()` (best effort), then
  `self.clients.matchAll({ type: 'window', includeUncontrolled: true })`, and calls `client.navigate(client.url)`
  for every window client without awaiting the navigations: each one is a fetch this worker now serves, and
  the browser holds fetch events until activation has finished, so awaiting them would deadlock activation
  until the event timeout. `navigate` rejects for a client the worker does not control or that is
  mid-navigation; one rejection must not stop the others. A first install (no earlier worker) keeps the silent
  `clientsClaim` behaviour, so a first-time visitor is not reloaded mid-onboarding.

`useServiceWorkerUpdate` is unchanged: its "Update installed" toast may show for an instant before the forced
navigation lands. The guards that benefit from this reload (the Dexie recreate loop-breaker of ADR-0019, the
sign-out of un-migrated sessions in ADR-0026) are designed so that the reload converges them, not so that they
depend on it.

Accepted costs, for this release only: in-progress composition in an old tab is lost; the new-build tab that
triggered the install reloads too (it sits at the sign-in or migration gate, so nothing is lost); discovery
still depends on the browser's `sw.js` check (immediate on any navigation, within
`SW_UPDATE_CHECK_MIN_INTERVAL_MS` of a tab becoming visible, at most 24 h), so a tab that never triggers a
check keeps writing 0.x until it does; `WindowClient.navigate` on WebKit is unverified; no worker means no
effect (dev without `SERWIST_DEV`, a rejected registration).

Revert: the first release after the cut-over (PR-E2) restores `skipWaiting: false`, removes the listener and
its test ("claims then navigates every window client"), and drops the rollout note from `docs/pwa.md`. The
consent policy above stays the rule; this amendment records the exception.

## Consequences

### Positive ✅

- One cache with one freshness rule: Dexie + TTL. No second, opaque layer to reason about in bug reports.
- Deploys no longer break open tabs; users choose when to take an update.
- Offline navigations show a branded page instead of the browser error, without triggering the session wipe.
- First-visit install payload drops from ~43 MB to ~15 MB and no longer fails on a single large asset.

### Negative ❌

- No offline data or write queue from the worker. Both belong at the Application layer (Dexie outbox, network-aware session restore) and are tracked as follow-ups.
- Users must act on the update toast; a tab left open keeps the old version until they do or until every tab closes. A non-accepting tab may hit chunk-load errors for lazily loaded routes until it reloads (#2548).

### Neutral ⚠️

- Persistent toasts are exempt from the toast limit so the update prompt cannot be evicted by ordinary feedback.
- `navigationPreload` is on and consumed by the navigation route; Safari ignores it.

## Alternatives Considered

### Keep a runtime cache for Nexus, fixed to match every host

Would double-cache data the app already keeps in Dexie and let a failed fetch return a cached body the TTL layer records as fresh. Rejected: conflicts with the local-first design.

### Keep `skipWaiting: true` and reload on `controllerchange`

Simpler, but reloads every tab the moment a deploy lands, mid-composition included. Rejected in favour of consent;
used deliberately for exactly one release by the _Amendment_ above.

### A Next `/offline` route precached via `additionalPrecacheEntries`

Setting `additionalPrecacheEntries` disables the public glob, the route has no content hash for `revision`, it would need `PUBLIC_ROUTES` handling, and rendering it boots the app (session wipe). Rejected.

## Implementation Notes

- Options: `next.config.ts` (`withSerwistInit`); worker: `src/sw.ts`; hooks under `src/hooks/useServiceWorkerUpdate/`, `useNetworkStatusToasts/`, `useAppBadge/`, `useInstallPrompt/`; mounted by `src/components/organisms/PwaManager/PwaManager.tsx` outside the DB/auth gates.
- `src/sw.test.ts` asserts the worker's configuration; `src/libs/pwa/manifest.test.ts` guards the manifest.
- Full guide: `docs/pwa.md`.

## Related Decisions

- [ADR-0001: Local-first writes](./0001-local-first-writes.md)
- [ADR-0005: TTL refresh policy](./0005-ttl-refresh-policy.md)
- [ADR-0016: Service worker local file cache](./0016-service-worker-local-file-cache.md) — a future avatar cache would be the one deliberate exception to "shell only", scoped to same-origin avatar URLs.

## References

- PR #559 (initial PWA), PR #1168 (share target), PR #1384 (`defaultCache` removal after pkarr cache interference).
