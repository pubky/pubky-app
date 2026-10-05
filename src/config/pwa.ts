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
