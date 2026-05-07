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

/**
 * Next.js framework convention export — discovered by name from this module.
 *
 * Next.js's App Router instrumentation invokes `onRouterTransitionStart` on every client-side
 * route transition; Sentry's `captureRouterTransitionStart` wires that signal into tracing so
 * navigation transactions stitch with the originating click/back-forward event. There is no
 * static import of this symbol in the codebase by design — it's a framework hook.
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
