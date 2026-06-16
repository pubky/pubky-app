import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';
import packageJson from './package.json';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  reactCompiler: true,
  // Source maps are generated for every build (browser + server) but NEVER uploaded here:
  // the Sentry plugin upload is disabled below so the Docker image build needs no Sentry
  // credentials. The CI pipeline injects Debug IDs (sentry-cli sourcemaps inject) and uploads
  // the maps separately; the runner image strips browser maps. See docs/sentry.md + ADR 0018.
  productionBrowserSourceMaps: true,
  experimental: {
    serverSourceMaps: true,
  },
  // Only use standalone output when building for Docker (set NEXT_STANDALONE=true)
  ...(process.env.NEXT_STANDALONE === 'true' && { output: 'standalone', experimental: { instrumentationHook: true } }),
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

const composedConfig = withNextIntl(withSerwist(nextConfig));

export default withSentryConfig(composedConfig, {
  silent: !process.env.CI,
  disableLogger: true,
  // The build NEVER uploads source maps (and needs no SENTRY_AUTH_TOKEN/ORG/PROJECT): the
  // single public image must be buildable without Synonym credentials. Debug-ID injection
  // and the upload happen in the CI pipeline via sentry-cli (see Dockerfile + ADR 0018).
  sourcemaps: {
    disable: true,
  },
  // Release identification comes from Sentry.init({ release }) at runtime (single source of
  // truth: package.json version, which always wins over any build-injected value). Without
  // credentials the plugin cannot create releases anyway — disable it explicitly so builds
  // never attempt Sentry API calls.
  release: {
    create: false,
  },
  // tunnelRoute deferred — adopting it requires creating middleware.ts to exclude
  // the /monitoring path. Revisit if Sentry shows ad-blocker drops.
});
