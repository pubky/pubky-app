import * as Sentry from '@sentry/nextjs';
import { getSentryInitBase, shouldEnableSentry } from '@/libs/observability/sentry';
import {
  getSentryReplaysOnErrorSampleRate,
  getSentryReplaysSessionSampleRate,
} from '@/libs/runtime-config/runtime-config';

// Safe to read runtime config here: ContainerRoot emits `window.__PUBKY_CONFIG__` with
// next/script strategy="beforeInteractive", which Next injects into <head> before app bundles.
if (shouldEnableSentry()) {
  Sentry.init({
    ...getSentryInitBase(),
    replaysSessionSampleRate: getSentryReplaysSessionSampleRate(),
    replaysOnErrorSampleRate: getSentryReplaysOnErrorSampleRate(),
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
