# PWA and Service Worker

How the installed-app layer works, what the service worker is allowed to do, and how to test it. The worker is built by Serwist (`@serwist/next`, core package `serwist`), not Workbox or `next-pwa`. Decision record: [ADR-0021](adr/0021-service-worker-scope-and-update-policy.md).

## Files

| Path                                                        | Role                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/sw.ts`                                                 | Service worker source: share target, navigation route with offline fallback, precache, cut-over takeover.  |
| `public/sw.js`                                              | Generated from `src/sw.ts` by `npm run build`. Gitignored, never edited.                                   |
| `next.config.ts` (`withSerwistInit`)                        | Build options: precache allow-list, chunk `exclude`, `register: false`, `reloadOnOnline: false`, dev flag. |
| `src/providers/ServiceWorkerRegistrationProvider/`          | Registers the worker from app code so a rejected registration is logged, not reported (#2556).             |
| `public/manifest.json`                                      | Web app manifest (colours, icons, shortcuts, screenshots, share target, protocol handler).                 |
| `public/offline.html`                                       | Static page served when a navigation cannot reach the network.                                             |
| `src/components/organisms/PwaManager/PwaManager.tsx`        | No-UI organism in the root layout that mounts the lifecycle hooks below.                                   |
| `src/hooks/useServiceWorkerUpdate/`                         | Runs the "Update available" flow and the cut-over announce; does not register the worker.                  |
| `src/hooks/useNetworkStatus/`, `useNetworkStatusToasts/`    | Offline / online signal and toasts.                                                                        |
| `src/hooks/useAppBadge/`                                    | Mirrors the unread notification count onto the app icon (Badging API).                                     |
| `src/hooks/useInstallPrompt/`, `useInstallPromptLifecycle/` | "Install Pubky" banner eligibility and actions; `beforeinstallprompt` capture.                             |
| `src/libs/pwa/`                                             | Pure helpers: platform detection, install-prompt capture, install-banner snooze, browser type shims.       |
| `src/libs/pwa/precacheExclude.ts`                           | Build-time (Node only) Serwist `exclude` predicate: drops the chunks that carry a given package.           |
| `src/config/pwa.ts`                                         | Banner kill switch, snooze schedule, standalone media query, update-check interval, cut-over messages.     |

## What the service worker does

1. **Precaches the app shell**: every `_next/static` asset the build emits plus a short allow-list of `public/` files (`offline.html`, the manifest, the logos, the manifest icons). See _Precache diet_ below.
2. **Handles the share target**: a `POST /share` from the OS share sheet is turned into a `303` to `/share?…` with any files stashed in the `share-target-files` cache (see `src/libs/share/shareTarget.ts`).
3. **Serves an offline fallback for App navigations**: same-origin page navigations outside `/api/` go to the network (`NetworkOnly`, consuming navigation preload). When the fetch itself fails (offline, DNS), Serwist's `fallbacks` returns the precached `offline.html`, except under the separate `/shop-embed` mount. An HTTP error response is passed through untouched.

## What it must never do

- **Cache data.** Dexie is the app's only data cache and the TTL layer is its only freshness mechanism (`docs/local-first.md`, `docs/data-patterns.md`). A runtime cache in the worker would hand the app a stale response it then stamps as fresh. There is no `defaultCache`, and no `runtimeCaching` entry other than the navigation route.
- **Touch cross-origin traffic.** Homeserver, pkarr relays, httprelay, Nexus and the CDN are excluded from the worker's runtime handlers. Homeserver writes use the WASM SDK's grant authorization; they do not depend on cross-origin session cookies. PR #1384 removed `defaultCache` after concurrent pkarr lookups cancelled each other through the cache.
- **Take over open tabs on its own.** `skipWaiting` is off; see _Update flow_. The social v1 cut-over is the one recorded exception, in force from that release until PR-E2 reverts it (_Rollout note_, ADR-0021 amendment).
- **Boot the app when offline.** The fallback is a static file, not a Next route: it keeps startup, session restore and other network-dependent initialization out of the offline response. Grant restore now retains its reference on temporary network failure; the static fallback does not depend on that recovery path.

## Update flow

1. `@serwist/next` injects `window.serwist` into the client bundle but does not register it (`register: false`). `ServiceWorkerRegistrationProvider` wraps the whole tree and calls `window.serwist.register()` in its own effect; a rejected registration is logged with `Logger.warn`, never thrown (#2556).
2. `useServiceWorkerUpdate` (mounted by `PwaManager`) works off the browser's registration, not the Serwist window client: it waits for `navigator.serviceWorker.ready`, listens for `updatefound` and `controllerchange` (and, while the social v1 cut-over holds, for the worker's `message` reply to its announce, see _Rollout note_), and re-reads `registration.waiting` whenever the tab becomes visible. (The Serwist client stops reporting updates found more than a minute after registration and freezes its `isUpdate` flag at register time, so it cannot drive a long-lived tab.)
3. A new build installs and waits (`skipWaiting: false`; the social v1 cut-over is the exception while it holds, see _Rollout note_). The hook shows one persistent, dismissible "Update available" toast per waiting worker. Persistent toasts do not count toward the toast limit, so later transient toasts stack next to it instead of evicting it. Dismissing it means "later": the same worker is not re-prompted in this page lifetime, a newer one is.
4. Reload posts `SKIP_WAITING`; the worker calls `self.skipWaiting()`, activates, and `clientsClaim` makes it the controller of every open tab. Only the tab that accepted reloads. Other tabs keep their in-progress state and get an "Update installed" toast with a Reload action; until they reload they may fail to lazy-load chunks the new precache dropped. If a chunk-load failure reaches either Next.js error boundary, it attempts one automatic reload per running build per tab session (#2548). The version guard is written to `sessionStorage` before reloading; a repeated failure for that build, or unavailable storage, keeps the terminal error UI. Event-handler and background-promise failures that never reach a boundary are outside this recovery path. See [stale chunk recovery](sentry.md#stale-chunk-recovery-after-a-deploy).
5. `registration.update()` is requested at most once per `SW_UPDATE_CHECK_MIN_INTERVAL_MS`, on a tab return.

The first install claims open tabs without a reload or a toast.

Rollout note (social v1 cut-over): the release that moves writes to `/pub/social/v1/` ships the worker with `skipWaiting: true` and an `activate` listener that, when the worker replaces an earlier one, claims every window client and navigates each one that did not announce itself to its own URL (`src/sw.ts`, ADR-0021 amendment). A first install still claims silently, so a first-time visitor is not reloaded mid-onboarding. A page still running the previous bundle would otherwise keep writing the retired `/pub/pubky.app/` tree until the user reloaded it, and nothing server-side reaches an open page. So on that deploy, and on every deploy while the exception holds, every open tab and installed-app window of a build without the handshake below (0.x) reloads without the toast as soon as the new worker has installed, and in-progress composition in such a tab is lost (the composer persists no draft). A page of a build with the handshake (`useServiceWorkerUpdate`, every v1 build) posts `SW_CLIENT_ANNOUNCE` with its `APP_VERSION` to each worker it finds installing or waiting; the worker leaves that window in place and answers `SW_TAKEOVER_SKIPPED` with its own `NEXT_PUBLIC_APP_VERSION`, which webpack's DefinePlugin inlines into `public/sw.js` (the worker is a child compilation of the client bundle; `Env` is not imported into the worker, it would carry zod and the error factories). The page shows nothing when the identities match, since it already runs the build that took over (the first boot after a deploy runs under the previous worker): no "Update available" while that worker passes through `installed`, no "Update installed" when it takes over, and a prompt that beat the reply is dismissed. It shows the "Update installed" toast otherwise (a later deploy claiming a v1 tab). A worker restarted between install and activate forgets the announcements and reloads every window, as before the handshake (FIX-FINAL-8, 2026-11-13). PR-E2 removes the cut-over `install`, `message` and `activate` listeners with the `replacesActiveWorker` flag and the announced-window set (the earlier `activate` listener that deletes the legacy Nexus cache stays), restores `skipWaiting: false`, drops the six cut-over tests in `src/sw.test.ts`, the announce in `useServiceWorkerUpdate` with its tests and the two message constants in `src/config/pwa.ts`, and the consented flow above resumes; its timing is not the next release but the team's call (D9: once Nexus shows migrated users' 0.x writes at about zero, or after a period the team picks), recorded in `docs/migrations/social-v1.md`. `skipWaiting` is always decided by the installing worker's own script: on the consent flow's own first deploy, pages running a bundle without the update hook saw no toast and the worker activated once every tab of that client had closed, and the same rule is what makes the takeover reach old tabs.

The rollout note's residual risks: discovery still depends on the browser's `sw.js` check (immediate on any navigation, within `SW_UPDATE_CHECK_MIN_INTERVAL_MS` of a tab becoming visible, at most 24 h), and a page without a worker (dev without `SERWIST_DEV`, a rejected registration) is not reached. `WindowClient.navigate` itself is no longer a residual: on production builds it reloaded every open tab onto the new build in Chromium 151 (signed out) and the signed-in tab in Firefox 153 and WebKit 26.5 (QA-4, 2026-11-10; `docs/migrations/social-v1.md`, _QA matrix_). The Dexie recreate loop-breaker (ADR-0019) covers the two-builds-in-one-profile case independently of the worker, for the new build: that tab stops and shows the conflict screen. A 0.x tab the worker cannot reach can still land on the new database (the residual in the ADR-0019 amendment).

Two things the takeover does to a page it reloads, which app code has to tolerate (verified on a production build, 2026-11-13; ADR-0021 amendment): `client.navigate(client.url)` lands on the document's **creation URL**, the page the tab was opened or reloaded at, not the route the SPA moved it to since, so the user of a reloaded tab loses their in-app place; and, before the handshake above, every open or reload after a deploy booted the new build **twice**, once under the old worker (the navigation route is `NetworkOnly`, so the document is already the new build) and once after the takeover reload, on the creation URL. Since FIX-FINAL-8 the worker leaves pages that announced themselves in place, so a page of the new build boots once and only 0.x pages are reloaded; the second boot remains possible for a worker that lost its announcements, so anything the first boot leaves for the user to see still has to be found by a second boot on any route: the migration gate's signed-out explanation is route-independent for that reason (`RouteGuardProvider`, ADR-0026 amendment). A worker that asks the page to `location.reload()` instead is no longer needed for new-build pages; it would be the way to reload them on their current route if that were ever wanted.

## Offline fallback

`public/offline.html` is a self-contained page (inline CSS, `#05050A` background, the precached `/pubky-logo.svg`, a Retry button that reloads the page the user actually asked for, and an `online` listener that does the same). Prettier and ESLint ignore `public/`, so keep it hand-formatted. It is in the precache allow-list, and Serwist revisions it by content hash, so edits invalidate automatically.

Do not replace it with a Next route: `/offline` under the root layout would render `DatabaseProvider` → `RouteGuardProvider` and start session restoration and account initialization. The same separation applies to the Pubky Passport callback page (`public/passport/return.html`), which opens in a popup on the origin the opener is signing into and must not start a second App lifecycle.

## Precache diet

`@serwist/next` globs `public/` into the precache on top of `_next/static`. Those public entries bypass `exclude` and `maximumFileSizeToCacheInBytes` (they are appended last by `@serwist/build`), so `globPublicPatterns` in `next.config.ts` is the only size control for public assets. It is a purely additive allow-list: `offline.html`, the manifest, the two logos, and the manifest icons by name. In-app illustrations, landing media, `pubky.mp4`, `franky.png`, the og:image and the manifest screenshots stay out (the app never boots offline, so nothing beyond the offline page and the shell chunks is needed, and a precache install is all-or-nothing). Adding a public file to the precache means adding its name here.

Read the `(serwist)` line in the build output: it lists how many URLs are precached and their total size. A jump in either is the signal that a new large `public/` file matched the allow-list, or that `exclude` was set without keeping `/\.map$/` (source maps are ~30 MB).

`maximumFileSizeToCacheInBytes` is 3 MiB for webpack assets: an over-limit chunk is dropped with only a build warning and would break offline boot.

Webpack chunks are filtered by `exclude` in `next.config.ts`. Setting it replaces Serwist's default list, so `/\.map$/` (source maps, ~30 MB) and `/^manifest.*\.js$/` are repeated there. The third entry, `excludeChunksCarrying('pubky-social-migrator')` from `src/libs/pwa/precacheExclude.ts`, drops the social v1 migrator (~800 KB, its wasm inlined as base64): the migration gate loads it once per account through a dynamic `import()` and a migrated user never loads it again, so a precache install should not pay for it. The predicate matches a chunk by the modules it carries (`compilation.chunkGraph`), not by file name, because Next names a chunk that holds a node_modules module over 160 KB by a hash of the module path (its `lib` cache group), so neither the package name nor a `webpackChunkName` comment reaches the asset name. It only excludes correctly while the migrator is reached through `import()`: a dynamic-import chunk carries nothing its parents already have. A static import would put the migrator into a shell chunk, and that whole chunk would leave the precache, which shows on the `(serwist)` line as a drop far larger than 800 KB.

Verifying the exclusion after `npm run build` (the package must be installed and imported for there to be anything to exclude):

```bash
comm -13 <(grep -o 'static/chunks/[^"]*\.js' public/sw.js | sort -u) <(cd .next && ls static/chunks/*.js | sort)
```

The output must be exactly the migrator's chunk(s): one ~800 KB file (`ls -l` it) and, when the package entry is split from its wasm glue, a small companion. The `(serwist)` line itself is the summary: it should read ~800 KB less than the same build with the predicate removed, and the URL count one or two lower.

## Manifest

`public/manifest.json` is hand-maintained; `src/libs/pwa/manifest.test.ts` guards it against drift (colours equal `COLORS.background`, `start_url` is `APP_ROUTES.HOME`, `id` stays `/`, every referenced file exists, every shortcut is a known route, screenshots are labelled). `id` must not change: Chrome keys installed apps on it.

The maskable icon is a separate asset with a safe-zone margin. Regenerate it from the 512 icon with `sharp` (already in the tree as a Next dependency):

```js
const sharp = require('sharp');
const glyph = await sharp('public/images/manifest/web-app-manifest-512x512.png').resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#000000' } })
  .composite([{ input: glyph, gravity: 'centre' }])
  .png({ compressionLevel: 9, palette: true })
  .toFile('public/images/manifest/web-app-manifest-512x512-maskable.png');
```

(The canvas is `#000000` because the source icon's own background is opaque black; `#05050A` would show a seam.)

## Install banner

`AlertInstall` (Home feed, between `FeedNavigation` and `AlertBackup`) is driven by `useInstallPrompt`. It shows for a signed-in user browsing in a tab, once the browser can install (Chromium fired `beforeinstallprompt`, or iOS Safari where the steps are manual), while no backup reminder is pending, and only when the snooze in `src/libs/pwa/installReminder.ts` is due. "Later" snoozes with the `PWA_INSTALL_REMINDER_DELAYS_MS` schedule; installing, `appinstalled`, or confirming the iOS steps retires it. `PWA_INSTALL_BANNER_ENABLED` is the kill switch. The banner never renders in unit tests or VRT (no captured prompt, non-iOS user agents).

## Testing locally

- **Unit**: `npm test -- src/sw.test.ts src/libs/pwa src/hooks/useServiceWorkerUpdate` (the worker is evaluated in jsdom with `serwist` mocked to assert its configuration).
- **Registration, update toast, share target in dev**: `SERWIST_DEV=true npm run dev:https` (webpack only; Turbopack never builds the worker). Dev builds ship an empty precache, so the offline fallback cannot be exercised there.
- **Offline fallback and precache**: `npm run build && npm run start`, then DevTools → Application → Service Workers → tick _Offline_ → navigate. Check the Manifest panel for colours, shortcuts and the maskable preview.
- **Update flow**: with `npm run start` running, change any string, `npm run build` again, revisit the tab → "Update available" → Reload.
- Install prompt, app badge and the OS share sheet need a real HTTPS origin and a device: use a PR preview deploy.

## Embedded Shop

Document navigations to the separate Shop deployment at `/shop-embed` use `NetworkOnly` so the App service worker consumes navigation preload instead of abandoning a parallel preload request. Shop navigations remain excluded from App offline fallback; API/asset subresource requests remain outside the navigation handler. `/shop` remains the App shell. Embedded Shop must not register another service worker. See [Shop embedding](shop-embedding.md).
