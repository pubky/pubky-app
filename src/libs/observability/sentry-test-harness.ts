import { Env } from '@/libs/env/env';
import { shouldEnableSentry } from '@/libs/observability/sentry';
import { getSentryDsn, getSentryEnvironment, getSentryTracesSampleRate } from '@/libs/runtime-config/runtime-config';

/**
 * Shared gating + diagnostics for the Sentry verification harness
 * (`/sentry-test` page + `/api/sentry-test` route).
 *
 * The harness deliberately triggers errors to confirm — on a live deploy — that Sentry
 * captures each path and that uploaded source maps resolve to readable stack traces.
 * It must be reachable on PR previews but never in real production.
 */

const PRODUCTION_ENVIRONMENT = 'production';

/**
 * Resolved deployment environment, mirroring the tag Sentry attaches to every event
 * (`getSentryInitBase` → `resolveSentryEnvironment`): the runtime `sentryEnvironment` wins,
 * falling back to NODE_ENV.
 *
 * On the client, NODE_ENV is inlined at build time ('production' for ANY non-dev build,
 * including PR previews), so the runtime `sentryEnvironment` is the only thing that
 * distinguishes a preview ('preview') from real production ('production'). This is why the
 * harness gates on the resolved environment rather than NODE_ENV or NEXT_PUBLIC_DEBUG_MODE
 * (previews build with DEBUG_MODE=false).
 */
function resolveEnvironment(): string {
  try {
    return getSentryEnvironment() ?? Env.NODE_ENV;
  } catch {
    // A misconfigured deploy whose runtime config can't resolve is treated as production so
    // the harness fails closed (hidden) rather than leaking into a broken production build.
    return PRODUCTION_ENVIRONMENT;
  }
}

/**
 * Whether the Sentry verification harness is reachable in the current environment.
 *
 * Enabled everywhere EXCEPT real production:
 * - PR previews ('preview'), staging, dev, and local all expose it.
 * - `NEXT_PUBLIC_DEBUG_MODE=true` force-enables it for local builds.
 */
export function isSentryTestHarnessEnabled(): boolean {
  if (Env.NEXT_PUBLIC_DEBUG_MODE) return true;
  return resolveEnvironment() !== PRODUCTION_ENVIRONMENT;
}

export interface SentryDiagnostics {
  /** Result of `shouldEnableSentry()` — false means triggers fire but no events are sent. */
  enabled: boolean;
  /** Environment tag attached to every event (e.g. "preview", "production"). */
  environment: string;
  /** Release tag; must match the version whose source maps were uploaded. */
  release: string;
  /** Configured DSN (a public client-side value, safe to display) or null when unset. */
  dsn: string | null;
  /** Performance trace sampling rate (0–1). */
  tracesSampleRate: number;
}

/**
 * Read-only snapshot of the resolved Sentry runtime configuration, surfaced on the harness
 * page so a tester can confirm a preview is wired correctly (Sentry enabled, expected
 * environment tag, release matching the uploaded source maps) before triggering errors.
 */
export function getSentryDiagnostics(): SentryDiagnostics {
  let environment = PRODUCTION_ENVIRONMENT;
  let dsn: string | null = null;
  let tracesSampleRate = 0;
  let enabled = false;

  try {
    environment = resolveEnvironment();
    dsn = getSentryDsn() ?? null;
    tracesSampleRate = getSentryTracesSampleRate();
    enabled = shouldEnableSentry();
  } catch {
    // Leave defaults; a resolution failure is itself useful signal ("disabled").
  }

  return {
    enabled,
    environment,
    release: Env.NEXT_PUBLIC_APP_VERSION,
    dsn,
    tracesSampleRate,
  };
}
