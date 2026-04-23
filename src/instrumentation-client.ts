import * as Sentry from '@sentry/nextjs';
import { Env } from '@/libs/env/env';
import { getSentryInitBase, shouldEnableSentry } from '@/libs/observability/sentry';

if (shouldEnableSentry()) {
  Sentry.init({
    ...getSentryInitBase(),
    replaysSessionSampleRate: Env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
    replaysOnErrorSampleRate: Env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
        networkCaptureBodies: false,
      }),
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
