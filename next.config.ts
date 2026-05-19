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

const composedConfig = withNextIntl(withSerwist(nextConfig));

export default withSentryConfig(composedConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  // Skip the source-map upload step entirely when no auth token is configured
  // (local builds, forks without secrets) so the build doesn't fail.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // tunnelRoute deferred — adopting it requires creating middleware.ts to exclude
  // the /monitoring path. Revisit if Sentry shows ad-blocker drops.
});
