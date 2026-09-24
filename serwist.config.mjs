import { getManifest } from '@serwist/build';
import { serwist } from '@serwist/next/config';

// `public/` precache allow-list (docs/pwa.md, ADR-0021). The classic integration appended public
// entries without its chunk size limit, so this list is the only size control for public assets.
// Keep it additive: only what the shell, the manifest and the offline page need. Illustrations,
// landing media and screenshots stay out.
const { manifestEntries: publicEntries } = await getManifest({
  globDirectory: 'public',
  globPatterns: [
    'offline.html',
    'manifest.json',
    'pubky-logo.svg',
    'pubky-favicon.svg',
    'images/manifest/web-app-manifest-{48x48,72x72,96x96,128x128,144x144,152x152,180x180,192x192,384x384,512x512,512x512-maskable}.png',
  ],
  maximumFileSizeToCacheInBytes: Number.MAX_SAFE_INTEGER,
  modifyURLPrefix: { '': '/' },
});

export default serwist.withNextConfig((nextConfig) => ({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  // Keep the classic integration's asset caching policy; do not add prerendered pages.
  precachePrerendered: false,
  // Include emitted fonts as well as chunks. Configurator mode's default glob omits fonts.
  globPatterns: [`${nextConfig.distDir}/static/**/*`],
  globIgnores: ['**/*.map'],
  // The largest chunk is ~1.75 MB; an over-limit chunk is dropped with only a build warning
  // and would break offline boot, so keep headroom above the 2 MiB default.
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  additionalPrecacheEntries: publicEntries,
  // Keep the existing classic-worker registration compatible with installed PWAs.
  esbuildOptions: { format: 'iife' },
}));
