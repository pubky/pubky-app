import { createScreenNameMapper, type LogEvent, Pulse, type PulseEventHint } from '@synonymdev/pubky-pulse-web';
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
import { INLINE_IMAGE_UPLOAD_REJECTION_NAME } from '@/hooks/useInlineImageUpload/useInlineImageUpload.types';
import { Env } from '@/libs/env/env';
import { AppError } from '@/libs/error/error';
import { sanitizeForSentry, shouldDropCapturedExceptionFromSentry } from '@/libs/observability/sentry.utils';
import { getDeployEnv, getPulseClientKey, getPulseEndpoint } from '@/libs/runtime-config/runtime-config';
import { getPulseConsent, subscribePulseConsent } from './pulse-consent';

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
  if (getPulseConsent() !== 'accepted') return null;
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

export function initPulse(): void {
  if (getPulseConsent() !== 'accepted') return;
  try {
    Pulse.init({
      apiKey: getPulseClientKey(),
      endpoint: getPulseEndpoint(),
      enabled: Env.NODE_ENV !== 'test' && !Env.VITEST,
      appVersion: Env.NEXT_PUBLIC_APP_VERSION,
      isDev: Env.NODE_ENV !== 'production' || getDeployEnv() !== 'production',
      consoleLogging: false,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Failed to fetch',
        /Loading chunk \d+ failed/,
        'AbortError',
        'Non-Error promise rejection captured',
        INLINE_IMAGE_UPLOAD_REJECTION_NAME,
        /window\.webkit\.messageHandlers/,
        /Java object is gone/,
        /Java exception was raised during method invocation/,
        /Failed to connect to MetaMask/,
      ],
      // Failures only: rejected fetches pass through ignoreErrors and drop to warn while offline; successful
      // requests are sampled per session and nothing consumes their timings yet.
      networkTracking: { urlMode: 'origin', sampleRate: 0 },
      screenNameForPath: pulseScreenName,
      beforeSend: beforeSendPulse,
    });
  } catch {
    // Runtime-config getters run before the SDK's safe init and must not break startup.
  }
}

/** Install the consent gate before any application code can start tracking. */
export function initializePulseConsent(): () => void {
  let started = false;
  const sync = () => {
    if (getPulseConsent() === 'accepted') {
      if (!started) initPulse();
      started = true;
    } else if (started) {
      // reset() disables synchronously without flushing, removes collectors and deletes the anonymous ID,
      // session and queued events the banner asked consent to store, so nothing replays on re-acceptance.
      Pulse.reset();
      started = false;
    }
  };
  const unsubscribe = subscribePulseConsent(sync);
  sync();
  return unsubscribe;
}
