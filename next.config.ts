import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from '@serwist/next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Only use standalone output when building for Docker (set NEXT_STANDALONE=true)
  ...(process.env.NEXT_STANDALONE === 'true' && { output: 'standalone' }),
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

const baseConfig = withNextIntl(withSerwist(nextConfig));
// TODO: Once we are ready for production, change to: process.env.NODE_ENV === 'production'
const isStaging = process.env.NEXT_PUBLIC_NEXUS_URL?.includes('staging') ?? false;

export default isStaging
  ? withSentryConfig(baseConfig, {
      org: 'synonym-52',
      project: 'pubky-app',
      // Only print logs for uploading source maps in CI
      silent: !process.env.CI,
      // Pass the auth token
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Upload a larger set of source maps for prettier stack traces
      widenClientFileUpload: true,
      // Use a fixed route (recommended)
      tunnelRoute: '/monitoring',
    })
  : baseConfig;
