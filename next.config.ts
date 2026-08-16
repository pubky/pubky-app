import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs';
import packageJson from './package.json';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? packageJson.version,
  },
  reactCompiler: true,
  // Source maps are generated for every build (browser + server), but the Sentry plugin upload
  // is disabled below. Docker builds inject Debug IDs and optionally upload maps when Sentry
  // build credentials are provided; public builds without those credentials skip upload.
  // See docs/sentry.md + ADR 0018.
  productionBrowserSourceMaps: true,
  experimental: {
    serverSourceMaps: true,
  },
  // Only use standalone output when building for Docker (set NEXT_STANDALONE=true)
  ...(process.env.NEXT_STANDALONE === 'true' && { output: 'standalone' }),
  async redirects() {
    return [
      // /profile/[pubky] is the canonical other-user posts view (see app/profile/[pubky]/page.tsx).
      // The legacy /profile/[pubky]/posts route is kept as a 308 permanent redirect so existing
      // bookmarks, shares, and search indexes consolidate onto the canonical URL without invoking
      // any React/SSR work for the legacy path.
      {
        source: '/profile/:pubky/posts',
        destination: '/profile/:pubky',
        permanent: true,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('@synonymdev/pubky');
    }

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    return config;
  },
  // Turbopack config for WebAssembly dependencies
  turbopack: {
    resolveAlias: {
      '@synonymdev/pubky': '@synonymdev/pubky/index.js',
      'pubky-app-specs': 'pubky-app-specs/index.js',
    },
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const composedConfig = withSerwist(nextConfig);

export default withSentryConfig(composedConfig, {
  silent: !process.env.CI,
  disableLogger: true,
  // Disable the Sentry plugin upload. Docker builds handle Debug-ID injection and optional
  // source-map upload via sentry-cli, while public builds without Sentry credentials skip upload.
  sourcemaps: {
    disable: true,
  },
  // Release identification comes from Sentry.init({ release }) at runtime. Local builds use the
  // package version; Docker CI overrides NEXT_PUBLIC_APP_VERSION with the commit SHA so events
  // and uploaded maps share one release value. Disable release creation here so the plugin never
  // attempts Sentry API calls.
  release: {
    create: false,
  },
  // tunnelRoute deferred — adopting it requires creating middleware.ts to exclude
  // the /monitoring path. Revisit if Sentry shows ad-blocker drops.
});
