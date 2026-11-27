/**
 * PWA (installed web app) configuration.
 *
 * Service worker build options live in `next.config.ts`; the worker itself is
 * `src/sw.ts`. See `docs/pwa.md`.
 */

/** Kill switch for the "Install Pubky" banner on the Home feed. */
export const PWA_INSTALL_BANNER_ENABLED = true;

/** Feature-discovery storage id for the install banner (composed with `buildFeatureDiscoveryStorageKey`). */
export const PWA_INSTALL_STORAGE_ID = 'install-prompt-v1';

/** Escalating "Later" snooze schedule for the install banner; the last delay repeats. */
export const PWA_INSTALL_REMINDER_DELAYS_MS = [24, 72, 168].map((hours) => hours * 60 * 60 * 1000);

/**
 * `display_override` in `public/manifest.json` lists `minimal-ui` as the fallback
 * display mode, so both count as "running installed".
 */
export const PWA_STANDALONE_MEDIA_QUERY = '(display-mode: standalone), (display-mode: minimal-ui)';

/** Minimum gap between service-worker update checks triggered by the tab becoming visible. */
export const SW_UPDATE_CHECK_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** Page ↔ cut-over worker handshake (`src/sw.ts`, `useServiceWorkerUpdate`; ADR-0021 amendment, removed by PR-E2). */
export const SW_CLIENT_ANNOUNCE = 'CLIENT_ANNOUNCE';
export const SW_TAKEOVER_SKIPPED = 'TAKEOVER_SKIPPED';

/**
 * Same-origin paths the service worker answers with homeserver media when Nexus is not an indexer source
 * (`src/libs/pwa/localMedia.ts`). Next.js never routes a folder whose name starts with `_`, so no app route can
 * take this path.
 */
export const LOCAL_MEDIA_PATH_PREFIX = '/_pubky/';

/** Cache Storage cache of the media pages handed to the worker; deleted on sign-out. */
export const LOCAL_MEDIA_CACHE = 'pubky-local-media';

/** Entries kept in `LOCAL_MEDIA_CACHE`; the oldest go first. */
export const LOCAL_MEDIA_CACHE_MAX_ENTRIES = 500;

/**
 * The largest file the worker serves, 100 MiB, the most a v1 file may hold. A file passes through the page's and the
 * worker's memory whole when it is first read, so a larger one is refused with a 507 instead: the page checks the
 * stated length before reading the body and stops reading once the bytes pass it.
 */
export const LOCAL_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

/** How long the page may take to read one media file: 100 MiB is about 40 s at 20 Mbit/s. */
export const LOCAL_MEDIA_READ_TIMEOUT_MS = 60_000;

/**
 * How long the worker waits for a page to hand over media before it responds 504: the page's read, plus the
 * profile load (a lookup and a stream read) an avatar may need before it, so the worker never gives up on a read
 * that can still finish.
 */
export const LOCAL_MEDIA_CLIENT_TIMEOUT_MS = LOCAL_MEDIA_READ_TIMEOUT_MS + 30_000;

/** Worker to page: send the bytes of one local media path back over the transferred port. */
export const SW_LOCAL_MEDIA_REQUEST = 'LOCAL_MEDIA_REQUEST';
