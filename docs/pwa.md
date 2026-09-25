# PWA and Service Worker

How the installed-app layer works, what the service worker is allowed to do, and how to test it. The worker is built by Serwist (`@serwist/cli` in `@serwist/next` configurator mode, core package `serwist`), not Workbox or `next-pwa`. Decision record: [ADR-0021](adr/0021-service-worker-scope-and-update-policy.md).

## Files

| Path                                                        | Role                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/sw.ts`                                                 | Service worker source: share target, navigation route with offline fallback, precache.               |
| `public/sw.js`                                              | Generated from `src/sw.ts` by `npm run build` (`build:sw` after `next build`). Gitignored.           |
| `serwist.config.mjs`                                        | Build options: `_next/static` glob, the separate `public/` pass, chunk size limit.                   |
| `tooling/sw/precache.mjs`                                   | Precache policy shared by the build and the CI check: public allow-list, `_next/static` ignores.     |
| `tooling/sw/verify-precache.mjs`                            | CI check (Build workflow): the precache covers the build and every entry is served as built.         |
| `src/providers/ServiceWorkerRegistrationProvider/`          | Registers the worker from app code so a rejected registration is logged, not reported (#2556).       |
| `public/manifest.json`                                      | Web app manifest (colours, icons, shortcuts, screenshots, share target, protocol handler).           |
| `public/offline.html`                                       | Static page served when a navigation cannot reach the network.                                       |
| `src/components/organisms/PwaManager/PwaManager.tsx`        | No-UI organism in the root layout that mounts the lifecycle hooks below.                             |
| `src/hooks/useServiceWorkerUpdate/`                         | Runs the user-consented "Update available" flow; does not register the worker.                       |
| `src/hooks/useNetworkStatus/`, `useNetworkStatusToasts/`    | Offline / online signal and toasts.                                                                  |
| `src/hooks/useAppBadge/`                                    | Mirrors the unread notification count onto the app icon (Badging API).                               |
| `src/hooks/useInstallPrompt/`, `useInstallPromptLifecycle/` | "Install Pubky" banner eligibility and actions; `beforeinstallprompt` capture.                       |
| `src/libs/pwa/`                                             | Pure helpers: platform detection, install-prompt capture, install-banner snooze, browser type shims. |
| `src/config/pwa.ts`                                         | Banner kill switch, snooze schedule, standalone media query, update-check interval.                  |

## What the service worker does

1. **Precaches the app shell**: every `_next/static` asset the build emits plus a short allow-list of `public/` files (`offline.html`, the manifest, the logos, the manifest icons). See _Precache diet_ below.
2. **Handles the share target**: a `POST /share` from the OS share sheet is turned into a `303` to `/share?…` with any files stashed in the `share-target-files` cache (see `src/libs/share/shareTarget.ts`).
3. **Serves an offline fallback for navigations**: same-origin page navigations go to the network (`NetworkOnly`, consuming navigation preload). When the fetch itself fails (offline, DNS), Serwist's `fallbacks` returns the precached `offline.html`. An HTTP error response is passed through untouched.

## What it must never do

- **Cache data.** Dexie is the app's only data cache and the TTL layer is its only freshness mechanism (`docs/local-first.md`, `docs/data-patterns.md`). A runtime cache in the worker would hand the app a stale response it then stamps as fresh. There is no `defaultCache`, and no `runtimeCaching` entry other than the navigation route.
- **Touch cross-origin traffic.** Homeserver, pkarr relays, httprelay, Nexus and the CDN are never intercepted. Homeserver writes go through the WASM SDK with a cross-origin cookie and are invisible to the worker anyway. PR #1384 removed `defaultCache` after concurrent pkarr lookups cancelled each other through the cache.
- **Take over open tabs on its own.** `skipWaiting` is off; see _Update flow_.
- **Boot the app when offline.** The fallback is a static file, not a Next route: booting the app offline runs the session restore, which today wipes local state when the homeserver is unreachable.

## Update flow

1. Nothing is injected into the client bundle (there is no `window.serwist`). `ServiceWorkerRegistrationProvider` wraps the whole tree and, where `isServiceWorkerEnabled()` (`src/libs/pwa/platform.ts`: production builds with service worker and Cache API support; `useServiceWorkerUpdate` reads the same gate) is true, registers `/sw.js` (classic worker, scope `/`) with the `@serwist/window` client in its own effect; a rejected registration is logged with `Logger.warn`, never thrown (#2556). It does not reload on `online`: the local-first UI recovers on its own and `useNetworkStatusToasts` reports connectivity.
2. `useServiceWorkerUpdate` (mounted by `PwaManager`) works off the browser's registration, not the Serwist window client: it waits for `navigator.serviceWorker.ready`, listens for `updatefound` and `controllerchange`, and re-reads `registration.waiting` whenever the tab becomes visible. (The Serwist client stops reporting updates found more than a minute after registration and freezes its `isUpdate` flag at register time, so it cannot drive a long-lived tab.)
3. A new build installs and waits (`skipWaiting: false`). The hook shows one persistent, dismissible "Update available" toast per waiting worker. Persistent toasts do not count toward the toast limit, so later transient toasts stack next to it instead of evicting it. Dismissing it means "later": the same worker is not re-prompted in this page lifetime, a newer one is.
4. Reload posts `SKIP_WAITING`; the worker calls `self.skipWaiting()`, activates, and `clientsClaim` makes it the controller of every open tab. Only the tab that accepted reloads. Other tabs keep their in-progress state and get an "Update installed" toast with a Reload action; until they reload they may fail to lazy-load chunks the new precache dropped. If a chunk-load failure reaches either Next.js error boundary, it attempts one automatic reload per running build per tab session (#2548). The version guard is written to `sessionStorage` before reloading; a repeated failure for that build, or unavailable storage, keeps the terminal error UI. Event-handler and background-promise failures that never reach a boundary are outside this recovery path. See [stale chunk recovery](sentry.md#stale-chunk-recovery-after-a-deploy).
5. `registration.update()` is requested at most once per `SW_UPDATE_CHECK_MIN_INTERVAL_MS`, on a tab return.

The first install claims open tabs without a reload or a toast. Rollout note: `skipWaiting` is decided by the installing worker's own script, so on the first deploy of this change the new worker simply waits; pages still running the old bundle have no update hook yet and see no toast, and the new worker activates once every tab of that client closes. Consented, toast-driven updates start with the deploy after this one.

## Offline fallback

`public/offline.html` is a self-contained page (inline CSS, `#05050A` background, the precached `/pubky-logo.svg`, a Retry button that reloads the page the user actually asked for, and an `online` listener that does the same). Oxfmt ignores `public/` and Oxlint does not lint HTML, so keep it hand-formatted. It is in the precache allow-list, and Serwist revisions it by content hash, so edits invalidate automatically.

Do not replace it with a Next route: `/offline` under the root layout would render `DatabaseProvider` → `RouteGuardProvider`, start the session restore, and log the user out in the background. The same rule applies to the Pubky Passport callback page (`public/passport/return.html`), which opens in a popup on the origin the opener is signing into.

## Precache diet

`serwist.config.mjs` globs `public/` separately and appends the result as `additionalPrecacheEntries` on top of `_next/static`. The separate pass is load-bearing: configurator mode's manifest transform turns every globbed `.html` into a route URL (`public/offline.html` would become `/public/offline`, which the server does not serve, and the offline fallback would be missing), and additional entries skip that transform. They also bypass `maximumFileSizeToCacheInBytes`, so the allow-list is the only size control for public assets. It is a purely additive allow-list, `PUBLIC_PRECACHE_FILES` in `tooling/sw/precache.mjs`: `offline.html`, the manifest, the two logos, and the manifest icons by name. `serwist.config.mjs` fails the build when a listed file does not exist. In-app illustrations, landing media, `pubky.mp4`, `franky.png`, the og:image and the manifest screenshots stay out (the app never boots offline, so nothing beyond the offline page and the shell chunks is needed, and a precache install is all-or-nothing). Adding a public file to the precache means adding its name to `PUBLIC_PRECACHE_FILES`.

`npm run build:sw` prints `The service worker will precache N URLs, totaling X`. X counts only `_next/static` files: the public allow-list is added as 0 bytes, so a new public file shows up only in N (15 public entries today) and its size must be checked by hand. A jump in X means `STATIC_GLOB_IGNORES` lost `**/*.map` (source maps are ~30 MB) or the server-only Open Graph TTFs (src/libs/og/assets), which Turbopack also copies into `static/media`.

`maximumFileSizeToCacheInBytes` is 3 MiB for `_next/static` assets. The largest chunk, the Pubky SDK with its inline WASM and the BIP39 wordlists, is ~2.9 MB. An over-limit file is dropped from the precache with only a build warning and is then fetched from the network. The Build workflow therefore runs `tooling/sw/verify-precache.mjs` against the production server: it fails when a `_next/static` file outside `STATIC_GLOB_IGNORES` or an allow-listed public file is missing from the manifest, or when a manifest URL is not served as the built file.

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
- **Registration, update toast, share target, offline fallback and precache**: `npm run build && npm run start`. `next dev` never builds or registers the worker. Then DevTools → Application → Service Workers → tick _Offline_ → navigate. Check the Manifest panel for colours, shortcuts and the maskable preview.
- **Update flow**: with `npm run start` running, change any string, `npm run build` again, revisit the tab → "Update available" → Reload.
- Install prompt, app badge and the OS share sheet need a real HTTPS origin and a device: use a PR preview deploy.
