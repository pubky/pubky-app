import { getManifest } from '@serwist/build';
import { serwist } from '@serwist/next/config';

// The classic integration precaches public files independently of its 2 MiB chunk limit.
// Preserve that behavior, including the existing large landing-page video.
const { manifestEntries: publicEntries } = await getManifest({
  globDirectory: 'public',
  globPatterns: ['**/*'],
  globIgnores: ['sw.js', 'sw.js.map', 'swe-worker-*.js'],
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
  additionalPrecacheEntries: publicEntries,
  // Keep the existing classic-worker registration compatible with installed PWAs.
  esbuildOptions: { format: 'iife' },
}));
