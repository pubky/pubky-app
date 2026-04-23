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

const REDACTED = '[redacted: contained pubky:// URI]';

/**
 * Whether Sentry should be initialized in the current runtime.
 * False during tests, false when no DSN is configured.
 *
 * The `!Env` guard protects against a module-init circular dependency:
 * env.ts → @/libs/error → error.factories.ts → observability/sentry.ts → env.ts.
 * If parseEnv() throws during validation, `Env` is still undefined when the
 * resulting AppError flows into captureAppError → shouldEnableSentry. Without
 * the guard we'd mask the real validation error with a TypeError.
 */
export function shouldEnableSentry(): boolean {
  if (!Env) return false;
  if (Env.NODE_ENV === 'test') return false;
  if (Env.VITEST) return false;
  if (!Env.NEXT_PUBLIC_SENTRY_DSN) return false;
  return true;
}

/**
 * Resolved environment tag attached to every event.
 * Falls back to NODE_ENV when NEXT_PUBLIC_SENTRY_ENVIRONMENT is unset.
 * Internal: consumed only by getSentryInitBase() in the same file.
 */
function getSentryEnvironment(): string {
  if (!Env) return 'unknown';
  return Env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? Env.NODE_ENV;
}

/**
 * Defensive PII filter — redacts Pubky URIs across every string surface that can
 * carry an error message (top-level message, exception values, breadcrumb messages).
 *
 * A `pubky://` URI embeds a public key that, combined with content, may identify
 * the user. The browser/server initializers also set sendDefaultPii: false; this
 * hook is a second line of defense on the application payload.
 */
function scrubPubkyData(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  const containsPubkyUri = (value: unknown): boolean => typeof value === 'string' && value.includes('pubky://');

  if (event.message && containsPubkyUri(event.message)) {
    event.message = REDACTED;
  }

  // captureException populates event.exception.values[].value with the error message.
  // Unlike event.breadcrumbs, event.exception IS wrapped as { values: Exception[] } in-SDK.
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exception) => {
      if (containsPubkyUri(exception.value)) {
        return { ...exception, value: REDACTED };
      }
      return exception;
    });
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      if (containsPubkyUri(crumb.message)) {
        return { ...crumb, message: REDACTED };
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
