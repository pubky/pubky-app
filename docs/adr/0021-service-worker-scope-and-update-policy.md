# ADR 0021: Service Worker Scope and Update Policy

## Status

Accepted — 2026-09-15  
Updated — 2026-10-30 (exception for the social v1 cut-over: forced worker takeover; see _Amendment_)  
Updated — 2026-11-10 (the revert is not tied to the following release; its timing is the team's call, see _Amendment_)  
Updated — 2026-11-11 (the revert's scope spelled out; `WindowClient.navigate` verified in WebKit by QA-4)  
Updated — 2026-11-13 (`client.navigate(client.url)` lands on the creation URL, and every open after a deploy boots twice; see _Amendment_)  
Updated — 2026-11-13 (pages that announce themselves are left in place: the forced reload applies to 0.x pages, and the new build's own first boot stays; see _Amendment_)

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

## Amendment — social v1 cut-over (a bounded exception)

The release that moves the app from `pubky-app-specs` 0.x to `pubky-social-specs` 1.x (`/pub/social/v1/`,
ADR-0026) changes what the client writes to the homeserver. A page still running the previous bundle keeps
writing the retired `/pub/pubky.app/` tree until it reloads, and nothing server-side reaches an already-open
page: runtime config is memoized per load, the old bundle reads no version gate, and a same-profile old tab
even adopts the new grant through the `storage` event. The service worker lifecycle is the only channel that
reloads an old page without its consent and without changing old code.

From that release until the revert below, `src/sw.ts` ships with:

- `skipWaiting: true`: the new worker activates as soon as it installs instead of waiting for the "Update
  available" toast.
- an `activate` listener that, when the worker replaces an earlier one (`self.registration.active` was set
  during `install`), awaits `self.clients.claim()` (best effort), then
  `self.clients.matchAll({ type: 'window', includeUncontrolled: true })`, and calls `client.navigate(client.url)`
  for every window client that did not announce itself (next bullet) without awaiting the navigations: each one
  is a fetch this worker now serves, and the browser holds fetch events until activation has finished, so
  awaiting them would deadlock activation until the event timeout. `navigate` rejects for a client the worker
  does not control or that is mid-navigation; one rejection must not stop the others. A first install (no
  earlier worker) keeps the silent `clientsClaim` behaviour, so a first-time visitor is not reloaded
  mid-onboarding.
- a `message` listener (2026-11-13, FIX-FINAL-8) that records the `WindowClient.id` of every page posting
  `SW_CLIENT_ANNOUNCE` (`src/config/pwa.ts`) and answers it with `SW_TAKEOVER_SKIPPED` and the worker's own build
  identity: `NEXT_PUBLIC_APP_VERSION` (the commit SHA in CI, the package version locally) as webpack's DefinePlugin
  inlines it into `public/sw.js`, the worker being a child compilation of the client bundle; `Env` is not imported
  into the worker because it would carry zod and the error factories with it. `useServiceWorkerUpdate` posts the
  announce, with the page's `APP_VERSION`, to every worker it finds installing or waiting. A 0.x page has no such
  code, so it never announces and is reloaded as before: the forced reload is the rule for pages that do not
  announce, and the new build's own first boot under the previous worker (the double boot below) is left in
  place. The set of announced windows lives in the worker instance, like `replacesActiveWorker`: a worker
  restarted between install and activate loses both and takes the first-install path, so it claims and navigates
  nothing, 0.x tabs included, and those wait for their own next load or update check (the pre-existing D9 residual
  of the takeover itself; the handshake does not change it). A page whose announce loses the race to `matchAll` is
  reloaded as a 0.x page would be. A forged announce (any
  same-origin page can message the worker) exempts only the sender's own window from one navigation and learns
  the public build identity; nothing else reads the message.

`useServiceWorkerUpdate` shows nothing for a worker whose reply carried this page's own build identity (the page
already runs it): no "Update available" while that worker passes through `installed` (`skipWaiting` still waits
about 50 ms there), no "Update installed" when it takes over, and a prompt that beat the reply is dismissed at the
takeover. It keeps the "Update installed" consent toast for any other takeover: a v1 tab that a later
deploy's worker claims is told, not reloaded, which is D9's rule for v1 tabs; only pages without the handshake are
forced. Until 2026-11-13 the toast flashed on the new build's own page an instant before its forced reload. The
guards that benefit from this reload (the Dexie recreate loop-breaker of ADR-0019, the sign-out of un-migrated
sessions in ADR-0026) are designed so that the reload converges them, not so that they depend on it.

Accepted costs while the exception holds: in-progress composition in an old tab is lost (the composer persists no
draft; deferring the reload for a dirty composer was declined on 2026-11-04); every later deploy also reloads open
0.x tabs without the consent toast (a tab of a build with the handshake gets the toast instead); until 2026-11-13
the new-build tab that triggered the install reloaded too, on the premise that it sits at the sign-in or migration
gate so nothing is lost (the gate is reached again on any route since FIX-FINAL-7, but the reload landed on the
creation URL, below, and re-ran the first boot's start-up work); discovery
still depends on the browser's `sw.js` check (immediate on any navigation, within
`SW_UPDATE_CHECK_MIN_INTERVAL_MS` of a tab becoming visible, at most 24 h), so a tab that never triggers a
check keeps writing 0.x until it does; no worker means no effect (dev without `SERWIST_DEV`, a rejected
registration). `WindowClient.navigate` itself reloaded every open tab onto the new build in Chromium 151 (signed
out) and the signed-in tab in Firefox 153 and WebKit 26.5, on production builds (QA-4, 2026-11-10), so the engine
is not a residual.

Two properties of the takeover, verified on a production build with Playwright (2026-11-13,
`qa/restore-reauth-bounce/`), that the app has to tolerate while the exception holds:

- **`client.navigate(client.url)` lands on the document's creation URL, not its current route.** A
  `WindowClient.url` is the URL the document was created with (the Service Workers spec's "creation URL"): the page
  the tab was opened or reloaded at. The SPA's later `pushState` calls do not change it, so a tab reloaded at `/home`
  and moved to `/migration` by the gate comes back on `/home`, and a tab opened on `/` comes back on the landing page.
  The user of a reloaded tab loses their in-app place; since 2026-11-13 that is a 0.x tab, at the cut-over.
- **Every open or reload after a deploy is a double boot.** The navigation is served while the old worker still
  controls the page (the navigation route is `NetworkOnly`, so the document comes from the server and is the new
  build), the new build boots and runs whatever its start does (the Dexie recreate of ADR-0019, the gate of ADR-0026
  and its forced sign-out); 2–20 s later the browser's `sw.js` check installs the new worker, it activates, and the
  takeover above reloads the tab to its creation URL: a second boot of the new build, on a route the first boot may
  have left. Anything the first boot persisted has to be read by the second on any route; the gate's signed-out
  explanation is now route-independent for that reason (ADR-0026 amendment of the same date). QA-4 triggered the
  takeover from the old page with `registration.update()`, a single boot after the worker's navigation, which is why
  the double boot was not seen there. Since the same date (FIX-FINAL-8) the takeover leaves announced pages in
  place, so a page of the new build boots once; the second boot remains for a 0.x page (the point of the
  exception) and for an announce that lost the race to `matchAll`, which is why the route-independent
  explanation stays.

An alternative that keeps the current route, not built: the worker posts a message and a page of the new build
reloads itself with `location.reload()` (the current URL), `navigate` staying the fallback for pages of the old build,
which carry no listener. The announce handshake supersedes it for pages of the new build, which are no longer
reloaded at all; it would be the way to reload them on their current route if that were ever wanted (ADR-0026
amendment, _Consequences_).

Revert: PR-E2 removes the cut-over `install`, `message` and `activate` listeners with the `replacesActiveWorker` flag
and the announced-window set from `src/sw.ts` (the earlier `activate` listener that deletes the legacy Nexus cache
stays), restores `skipWaiting: false`, drops the cut-over tests in `src/sw.test.ts` ("activates as soon as it
installs" and the whole "social v1 cut-over takeover" suite), the announce in `useServiceWorkerUpdate` with its
"cut-over announce" tests and the two message constants in `src/config/pwa.ts`, and drops the rollout note from
`docs/pwa.md`. It is **not** tied to the release after the cut-over (D9): nobody can tell when the last 0.x tab is
gone, so the forced policy stays until Nexus shows migrated users' 0.x writes at about zero, or for a period the
team picks; keeping it costs little, since a v1 tab is claimed as soon as the new worker installs instead of after
a consent click and gets the "Update installed" toast, and only 0.x tabs are reloaded. The revert date is the team's decision and
is recorded in `docs/migrations/social-v1.md` when taken. The consent policy above stays the rule; this amendment
records the exception.

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
used deliberately, for a bounded time, by the _Amendment_ above.

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
