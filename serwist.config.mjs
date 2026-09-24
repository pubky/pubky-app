import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest } from '@serwist/build';
import { serwist } from '@serwist/next/config';
import { PUBLIC_PRECACHE_FILES, STATIC_GLOB_IGNORES } from './tooling/sw/precache.mjs';

// @serwist/build silently skips a glob that matches nothing, so a renamed allow-listed file (e.g.
// offline.html) must fail the build here instead of shipping a worker without it.
const missingPublicFiles = PUBLIC_PRECACHE_FILES.filter((file) => !existsSync(join('public', file)));
if (missingPublicFiles.length > 0) {
  throw new Error(`Public precache allow-list names missing files: ${missingPublicFiles.join(', ')}`);
}

// The public allow-list must stay a separate pass: configurator mode's manifestTransform rewrites every
// globbed `.html` into a route URL (`public/offline.html` -> `/public/offline`, which the server does not
// serve), while `additionalPrecacheEntries` bypass that transform and keep `/offline.html` for src/sw.ts.
const { manifestEntries: publicEntries, warnings: publicWarnings } = await getManifest({
  globDirectory: 'public',
  globPatterns: PUBLIC_PRECACHE_FILES,
  maximumFileSizeToCacheInBytes: Number.MAX_SAFE_INTEGER,
  modifyURLPrefix: { '': '/' },
});
if (publicWarnings.length > 0) throw new Error(`Public precache allow-list: ${publicWarnings.join('\n')}`);

export default serwist.withNextConfig((nextConfig) => ({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  // Keep the classic integration's asset caching policy; do not add prerendered pages.
  precachePrerendered: false,
  // Include emitted fonts as well as chunks. Configurator mode's default glob omits fonts.
  globPatterns: [`${nextConfig.distDir}/static/**/*`],
  globIgnores: STATIC_GLOB_IGNORES,
  // The largest chunk (the Pubky SDK with its inline WASM plus the BIP39 wordlists) is ~2.9 MB. An
  // over-limit file is dropped from the precache with only a build warning and is then fetched from the
  // network; the Build workflow's precache check fails when a static file is missing from the manifest.
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  additionalPrecacheEntries: publicEntries,
  // Keep the existing classic-worker registration compatible with installed PWAs.
  esbuildOptions: { format: 'iife' },
}));
