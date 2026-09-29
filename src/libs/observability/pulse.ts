import {
  createScreenNameMapper,
  type LogEvent,
  Pulse,
  type PulseEventHint,
  type PulseInitResult,
} from '@synonymdev/pubky-pulse-web';
import {
  APP_ROUTES,
  AUTH_ROUTES,
  COLLECTION_ROUTES,
  COPYRIGHT_ROUTES,
  DEV_ROUTES,
  getProfileRoute,
  ONBOARDING_ROUTES,
  PROFILE_ROUTES,
  ROOT_ROUTES,
  SETTINGS_ROUTES,
} from '@/app/routes';
import { Env } from '@/libs/env/env';
import { AppError } from '@/libs/error/error';
import { OBSERVABILITY_IGNORE_ERRORS } from '@/libs/observability/sentry.constants';
import { sanitizeForSentry, shouldDropCapturedExceptionFromSentry } from '@/libs/observability/sentry.utils';
import { getDeployEnv, getPulseClientKey, getPulseEndpoint } from '@/libs/runtime-config/runtime-config';
import { getPulseConsent, getPulseConsentGeneration, subscribePulseConsent } from './pulse-consent';

/**
 * Pulse browser SDK wiring: the consent gate, the `Pulse.init()` options, and `beforeSendPulse`.
 *
 * As for Sentry, do NOT import @synonymdev/pubky-pulse-web outside:
 * - This file (init + beforeSend)
 * - app/error.tsx and app/global-error.tsx (the React error boundaries)
 * - error.factories.ts (the one AppError capture call)
 *
 * There is deliberately no `capturePulseException` funnel mirroring `captureAppError`: the SDK runs
 * `beforeSendPulse` on every path — factory captures, boundary captures and its own unhandled handlers —
 * so it is already the single policy point, and a wrapper could only repeat it for the one path it sits
 * on. error.factories.ts could not route through this module in any case: pulse.ts → env.ts →
 * error.factories.ts would close a second arm on the init cycle sentry.ts guards against.
 */

// Which consent this tab's Pulse state was created under. It lives in sessionStorage so it is copied and
// discarded with the SDK's per-tab session keys, and it must not carry the SDK's "pulse." prefix or
// Pulse.reset() would purge it. It records an ordering, never an identifier, and is never sent.
const PULSE_STARTED_UNDER_KEY = 'pubky-pulse-consent-v1-started-under';
// An unreadable marker can never equal a consent generation, so the state counts as stale.
const UNREADABLE_GENERATION = 'unreadable';

function getStartedUnder(): string | null {
  try {
    return window.sessionStorage.getItem(PULSE_STARTED_UNDER_KEY);
  } catch {
    return UNREADABLE_GENERATION;
  }
}

function setStartedUnder(generation: string | null): boolean {
  try {
    if (generation === null) window.sessionStorage.removeItem(PULSE_STARTED_UNDER_KEY);
    else window.sessionStorage.setItem(PULSE_STARTED_UNDER_KEY, generation);
    return true;
  } catch {
    return false;
  }
}

/** True once this tab's Pulse state outlives the consent it was created under. An absent marker is a fresh tab. */
function predatesCurrentConsent(): boolean {
  const startedUnder = getStartedUnder();
  return startedUnder !== null && startedUnder !== getPulseConsentGeneration();
}

/** Route definitions are a telemetry allowlist: never add user identifiers or arbitrary paths. */
export const pulseScreenName = createScreenNameMapper(
  [
    ROOT_ROUTES,
    '/offline',
    '/profile/tags',
    ...Object.values(APP_ROUTES).filter((route) => route !== APP_ROUTES.FEED),
    ...[
      AUTH_ROUTES,
      COLLECTION_ROUTES,
      COPYRIGHT_ROUTES,
      DEV_ROUTES,
      ONBOARDING_ROUTES,
      PROFILE_ROUTES,
      SETTINGS_ROUTES,
    ].flatMap(Object.values),
    ...Object.values(PROFILE_ROUTES).map((route) => getProfileRoute(route, '[pubky]')),
    '/post/[userId]/[postId]',
    '/collections/[userId]/[postId]',
    '/invite/[inviteCode]',
    '/feed/[id]',
  ],
  { fallback: '/unknown' },
);

export function beforeSendPulse(event: LogEvent, { originalException: error }: PulseEventHint): LogEvent | null {
  if (getPulseConsent() !== 'accepted' || predatesCurrentConsent()) return null;
  if (shouldDropCapturedExceptionFromSentry(error)) return null;
  if (error instanceof AppError) {
    // Keep only reviewed operational metadata; never spread the error or its context.
    for (const [key, value] of Object.entries({
      category: error.category,
      code: error.code,
      service: error.service,
      operation: error.operation,
      trace_id: error.traceId,
    })) {
      if (value !== undefined) (event.custom_attributes ??= {})[key] = value;
    }
  }
  event.message = sanitizeForSentry(event.message) as string;
  event.custom_attributes = sanitizeForSentry(event.custom_attributes) as LogEvent['custom_attributes'];
  return event;
}

/**
 * The SDK's init result, or null when consent stopped us before the call. Pulse.init never throws: a start
 * that was refused or that failed is reported through the result's status, so callers must read it.
 */
export function initPulse(): PulseInitResult | null {
  if (getPulseConsent() !== 'accepted') return null;
  try {
    return Pulse.init({
      apiKey: getPulseClientKey(),
      endpoint: getPulseEndpoint(),
      enabled: Env.NODE_ENV !== 'test' && !Env.VITEST,
      appVersion: Env.NEXT_PUBLIC_APP_VERSION,
      isDev: Env.NODE_ENV !== 'production' || getDeployEnv() !== 'production',
      consoleLogging: false,
      // The SDK stamps browser-derived fields on every event, all on by default. Spelled out rather than
      // inherited: OS and browser stay because they are what makes a browser-only error actionable and the
      // banner names them; the language pair goes, because `locale` and `preferred_language` are both
      // `navigator.language`, the app ships one language and never sets `supportedLanguages`.
      deviceInfo: { os: true, browser: true, language: false },
      // The same list Sentry spreads, so the two sinks cannot drift onto different noise policies.
      ignoreErrors: [...OBSERVABILITY_IGNORE_ERRORS],
      // No networkTracking: network failures reach Pulse as AppErrors, so they pass the shared drop policy
      // that the SDK's fetch-level tracking cannot apply.
      screenNameForPath: pulseScreenName,
      beforeSend: beforeSendPulse,
    });
  } catch {
    // Unreachable today: the consent check above already resolved and memoized the runtime config, and the
    // SDK reports failures instead of throwing. Kept so a future read here can never break startup.
    return null;
  }
}

/** Install the consent gate before any application code can start tracking. */
export function initializePulseConsent(): () => void {
  let running = false; // this page has a live client; the marker outlives the page and cannot say so
  const sync = () => {
    const accepted = getPulseConsent() === 'accepted';
    const stale = predatesCurrentConsent();
    if (!accepted || stale) {
      // Both resets disable synchronously without flushing and remove the collectors; they differ in how
      // much they delete, and both run on a page that never started Pulse, because a returning tab still
      // holds the session a previous page stored and no other tab can delete it.
      //
      // Consent is gone: delete everything this browser holds — the anonymous ID, the session and every
      // queued event the banner asked consent to store — so nothing replays on re-acceptance. Anything
      // still queued was recorded before the withdrawal, so nothing current is lost with it.
      //
      // Consent stands and only this tab is stale: delete this tab's client and session alone. The
      // browser-wide state belongs to the current consent — another tab may already have minted the
      // shared anonymous ID and parked events under it — and purging it here would destroy telemetry
      // the user has consented to, from tabs that are not stale at all.
      Pulse.reset(accepted && stale ? { scope: 'tab' } : undefined);
      setStartedUnder(null);
      running = false;
    }
    if (!accepted || running) return;
    // Record the provenance before starting, so "SDK state present, marker absent" cannot exist and the
    // events init() records synchronously are not dropped by beforeSendPulse. The marker stays if the start
    // then fails: it describes the Pulse state this tab may still hold from an earlier page load, and
    // dropping it would make a stale tab look brand new and let it resume a pre-withdrawal session.
    if (!setStartedUnder(getPulseConsentGeneration())) return;
    // Only a client that actually started counts as running. A refused or failed init is retried on the next
    // consent notification, focus or pageshow; re-initializing a live client is a no-op in the SDK, so a
    // retry can never install a second set of collectors.
    running = initPulse()?.status === 'enabled';
  };
  const unsubscribe = subscribePulseConsent(sync);
  sync();
  return unsubscribe;
}
