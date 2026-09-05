import * as Sentry from '@sentry/nextjs';
import { getSentryInitBase, shouldEnableSentry } from '@/libs/observability/sentry';
import {
  getSentryReplaysOnErrorSampleRate,
  getSentryReplaysSessionSampleRate,
  RUNTIME_CONFIG_WINDOW_KEY,
} from '@/libs/runtime-config/runtime-config';
import { consumeFragmentSessionExport } from '@/libs/vibe-session/fragment';

// Strip `#s=` before any client routing or network that depends on auth.
// Always, including when consumer mode is off — never leave a session export in the URL.
consumeFragmentSessionExport();

// Safe to read runtime config here: ContainerRoot emits `window.__PUBKY_CONFIG__` as a raw
// inline <script> at the top of <body>, which the browser executes during HTML parsing —
// before this module (bundled into the main app chunks) evaluates. If the config is missing,
// shouldEnableSentry() would swallow the resolution error and silently disable client Sentry,
// so make the broken injection contract loud instead.
if (window[RUNTIME_CONFIG_WINDOW_KEY] === undefined) {
  console.error(
    `window.${RUNTIME_CONFIG_WINDOW_KEY} was not injected before client init — runtime-config injection is broken; ALL client runtime config (network URLs, moderation, analytics, ...) resolves to staging defaults and client Sentry stays disabled.`,
  );
}

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
