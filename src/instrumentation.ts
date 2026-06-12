import * as Sentry from '@sentry/nextjs';
import { getRuntimeConfig } from '@/libs/runtime-config/runtime-config';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Deliberately unguarded: resolving the runtime config at boot makes a misconfigured
    // deploy (missing/invalid PUBKY_RUNTIME_*) fail fast on startup with the full list of
    // required variables, instead of erroring on the first request. Dev/test fall back to
    // NEXT_PUBLIC_* defaults and never throw here (see src/libs/runtime-config).
    getRuntimeConfig();

    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Auto-captures unhandled errors from Server Components, Route Handlers, and middleware.
// Requires @sentry/nextjs >= 8.28.0 and Next.js >= 15.
export const onRequestError = Sentry.captureRequestError;
