import * as Sentry from '@sentry/nextjs';
import { Env } from '@/libs/env/env';
import { AppError } from '@/libs/error/error';
import {
  sanitizeForSentry,
  scrubSensitiveData,
  scrubSpanJson,
  scrubTransactionEvent,
  shouldDropAppErrorFromSentry,
} from '@/libs/observability/sentry.utils';
import {
  getSentryDsn,
  getSentryEnvironment,
  getSentryTracesSampleRate,
  getTestnet,
} from '@/libs/runtime-config/runtime-config';

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
 * False during tests, testnet deployments, and when no DSN is configured.
 * The DSN and testnet gates read RUNTIME config (PUBKY_RUNTIME_* / window.__PUBKY_CONFIG__),
 * so a single public image enables Sentry purely through deploy-time env vars.
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
  // Resolving runtime config can throw on a misconfigured deploy (missing PUBKY_RUNTIME_*).
  // The capture funnel must never throw — and especially must not mask the original boot
  // error with its own — so an unresolvable config simply means "Sentry disabled".
  try {
    if (getTestnet()) return false;
    if (!getSentryDsn()) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Whether `Sentry.init()` actually ran in the CURRENT runtime (browser or Node).
 * `shouldEnableSentry()` says whether Sentry SHOULD be enabled; this says whether init
 * really happened. The two diverge when init is skipped or fails — e.g. the client init
 * evaluating before `window.__PUBKY_CONFIG__` was injected — which otherwise fails silently.
 */
export function isSentryInitialized(): boolean {
  return Sentry.getClient() !== undefined;
}

/**
 * Resolved environment tag attached to every event.
 * Falls back to NODE_ENV when the runtime sentryEnvironment is unset.
 * Internal: consumed only by getSentryInitBase() in the same file (which only runs after
 * shouldEnableSentry() returned true, so the runtime config is already resolved and memoized).
 */
function resolveSentryEnvironment(): string {
  if (!Env) return 'unknown';
  return getSentryEnvironment() ?? Env.NODE_ENV;
}

/**
 * Shared options applied to every Sentry.init() call (browser, node, edge).
 * Each runtime layers its own additions on top (e.g. replayIntegration only on browser).
 *
 * Enablement is gated by each runtime initializer wrapping `Sentry.init()` in
 * `if (shouldEnableSentry())`. We deliberately do not also set `enabled: false`
 * inside these options: the outer guard already short-circuits before option
 * construction (and before constructing per-runtime integrations like
 * `replayIntegration({...})`), so duplicating the flag here would only add a
 * second enablement path readers have to reconcile.
 */
export function getSentryInitBase(): Sentry.NodeOptions & Sentry.BrowserOptions {
  return {
    dsn: getSentryDsn(),
    environment: resolveSentryEnvironment(),
    // The release stays build-time on purpose: Docker CI sets this to the commit SHA,
    // local builds fall back to package.json version, and source-map uploads must match it.
    release: Env.NEXT_PUBLIC_APP_VERSION,
    debug: false,
    sendDefaultPii: false,
    tracesSampleRate: getSentryTracesSampleRate(),
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Failed to fetch',
      /Loading chunk \d+ failed/,
      'AbortError',
      'Non-Error promise rejection captured',
    ],
    beforeSend: scrubSensitiveData,
    beforeSendTransaction: scrubTransactionEvent,
    beforeSendSpan: scrubSpanJson,
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
  if (shouldDropAppErrorFromSentry(error)) return;

  Sentry.withScope((scope) => {
    if (error.category) scope.setTag('error.category', error.category);
    if (error.code) scope.setTag('error.code', String(error.code));
    if (error.service) scope.setTag('error.service', error.service);
    if (error.operation) scope.setTag('error.operation', error.operation);
    if (error.traceId) scope.setTag('error.trace_id', error.traceId);
    if (error.context) scope.setContext('error.context', sanitizeForSentry(error.context) as Sentry.Context);
    Sentry.captureException(error);
  });
}
