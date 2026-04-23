import * as Sentry from '@sentry/nextjs';
import { Env } from '@/libs/env/env';
import { AppError } from '@/libs/error/error';

/**
 * Single source of truth for Sentry configuration shared across the three Next.js runtimes
 * (browser / node / edge).
 *
 * Per docs/sentry.md, do NOT import @sentry/nextjs directly outside of:
 * - The three init files (instrumentation-client.ts, sentry.server.config.ts, sentry.edge.config.ts)
 * - app/global-error.tsx and app/error.tsx
 * - This file (the capture funnel for AppError)
 *
 * Throw via Err.* factories instead — they route through captureAppError() automatically.
 */

/**
 * Whether Sentry should be initialized in the current runtime.
 * False during tests, false when no DSN is configured.
 */
export function shouldEnableSentry(): boolean {
  if (Env.NODE_ENV === 'test') return false;
  if (Env.VITEST) return false;
  if (!Env.NEXT_PUBLIC_SENTRY_DSN) return false;
  return true;
}

/**
 * Resolved environment tag attached to every event.
 * Falls back to NODE_ENV when NEXT_PUBLIC_SENTRY_ENVIRONMENT is unset.
 */
export function getSentryEnvironment(): string {
  return Env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? Env.NODE_ENV;
}

/**
 * Defensive PII filter — drops events whose message or breadcrumbs contain a Pubky URI
 * (which can embed a public key that, combined with content, may identify the user).
 *
 * The browser/server initializers also set sendDefaultPii: false; this hook is a second line.
 */
function scrubPubkyData(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  const containsPubkyUri = (value: unknown): boolean => typeof value === 'string' && value.includes('pubky://');

  if (event.message && containsPubkyUri(event.message)) {
    event.message = '[redacted: contained pubky:// URI]';
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      if (containsPubkyUri(crumb.message)) {
        return { ...crumb, message: '[redacted: contained pubky:// URI]' };
      }
      return crumb;
    });
  }

  return event;
}

/**
 * Shared options applied to every Sentry.init() call (browser, node, edge).
 * Each runtime layers its own additions on top (e.g. replayIntegration only on browser).
 */
export function getSentryInitBase(): Sentry.NodeOptions & Sentry.BrowserOptions {
  return {
    dsn: Env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: shouldEnableSentry(),
    environment: getSentryEnvironment(),
    release: Env.NEXT_PUBLIC_APP_VERSION,
    debug: false,
    sendDefaultPii: false,
    tracesSampleRate: Env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Failed to fetch',
      /Loading chunk \d+ failed/,
      'AbortError',
      'Non-Error promise rejection captured',
    ],
    beforeSend: scrubPubkyData,
  };
}

/**
 * Capture an AppError to Sentry with structured tags so issues are filterable
 * by category/code/service/operation in the Sentry UI.
 *
 * Called from src/libs/error/error.factories.ts so EVERY AppError flows through here exactly once.
 * Safe no-op when Sentry is disabled.
 */
export function captureAppError(error: AppError): void {
  if (!shouldEnableSentry()) return;

  Sentry.withScope((scope) => {
    if (error.category) scope.setTag('error.category', error.category);
    if (error.code) scope.setTag('error.code', String(error.code));
    if (error.service) scope.setTag('error.service', error.service);
    if (error.operation) scope.setTag('error.operation', error.operation);
    if (error.traceId) scope.setTag('error.trace_id', error.traceId);
    if (error.context) scope.setContext('error.context', error.context);
    Sentry.captureException(error);
  });
}
