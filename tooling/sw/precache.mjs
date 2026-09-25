// Precache policy shared by serwist.config.mjs (the build) and verify-precache.mjs (the CI check).
// It must stay free of side effects: evaluating serwist.config.mjs deletes public/sw.js, so the
// checker reads the policy from here instead of importing the build config.

const MANIFEST_ICON_SIZES = [
  '48x48',
  '72x72',
  '96x96',
  '128x128',
  '144x144',
  '152x152',
  '180x180',
  '192x192',
  '384x384',
  '512x512',
  '512x512-maskable',
];

/**
 * `public/` files the worker precaches (docs/pwa.md, ADR-0021): only what the shell, the manifest and
 * the offline page need. Keep it additive and name every file; illustrations, landing media and
 * screenshots stay out.
 */
export const PUBLIC_PRECACHE_FILES = [
  'offline.html',
  'manifest.json',
  'pubky-logo.svg',
  'pubky-favicon.svg',
  ...MANIFEST_ICON_SIZES.map((size) => `images/manifest/web-app-manifest-${size}.png`),
];

/**
 * `_next/static` files left out of the precache. Source maps are ~30 MB. The InterTight TTFs are the
 * server-only Open Graph fonts (src/libs/og/assets) that Turbopack also copies into static/media; no
 * client requests them (next/font serves woff2).
 */
export const STATIC_GLOB_IGNORES = ['**/*.map', '**/InterTight-*.ttf'];
