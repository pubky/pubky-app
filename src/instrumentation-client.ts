import * as Sentry from '@sentry/nextjs';
// TODO: Once we are ready for production, change to: process.env.NODE_ENV === 'production'
const isStaging = process.env.NEXT_PUBLIC_NEXUS_URL?.includes('staging') ?? false;
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enabled: isStaging,
  // Adds request headers and IP for users
  sendDefaultPii: true,
  // Capture 100% in dev, 10% in production
  // Adjust based on your traffic volume
  tracesSampleRate: isStaging ? 1.0 : 0.1,
});
// This export will instrument router navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
