'use client';

import { useState } from 'react';
import { Env, Err, ErrorService, ValidationErrorCode } from '@/libs';

/**
 * DEV/PREVIEW ONLY: Triggers test errors to verify Sentry capture across:
 * 1. Browser globalHandlers (unhandled exception)
 * 2. Server-side onRequestError (via /api/sentry-test)
 * 3. Err.* factory funnel (captureAppError with structured tags)
 * 4. React render-time throw → app/error.tsx boundary
 *
 * Gated on NEXT_PUBLIC_DEBUG_MODE so production builds render the not-allowed message.
 * Delete this folder + src/app/api/sentry-test/ once Sentry capture is verified.
 */
function RenderThrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    // Thrown during render so React's error boundary (src/app/error.tsx) catches it.
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Sentry test (render) — delete me', {
      service: ErrorService.Local,
      operation: 'sentryTestPage.throwOnRender',
    });
  }
  return null;
}

export default function SentryTestPage() {
  const [serverStatus, setServerStatus] = useState<string>('idle');
  const [throwOnRender, setThrowOnRender] = useState<boolean>(false);

  if (!Env.NEXT_PUBLIC_DEBUG_MODE) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col items-center justify-center p-6 text-center">
        <h1 className="text-[28px] leading-[1.2] font-semibold">Not available</h1>
        <p className="mt-3 text-muted-foreground">This page is only available when NEXT_PUBLIC_DEBUG_MODE is true.</p>
      </main>
    );
  }

  function throwClientError() {
    throw new Error('Sentry test (client) — delete me');
  }

  function throwViaFactory() {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Sentry test (factory) — delete me', {
      service: ErrorService.Local,
      operation: 'sentryTestPage.throwViaFactory',
      context: { triggeredAt: new Date().toISOString() },
    });
  }

  async function throwServerError() {
    setServerStatus('requesting...');
    const response = await fetch('/api/sentry-test');
    setServerStatus(`status: ${response.status}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-[28px] leading-[1.2] font-semibold">Sentry verification</h1>
      <p className="text-muted-foreground">
        Each button triggers an error and should produce exactly one event in Sentry.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={throwClientError}
          className="cursor-pointer rounded-full border border-border bg-secondary px-4 py-2 font-semibold text-foreground"
        >
          Throw client error (globalHandlers)
        </button>
        <button
          type="button"
          onClick={throwViaFactory}
          className="cursor-pointer rounded-full border border-border bg-secondary px-4 py-2 font-semibold text-foreground"
        >
          Throw via Err.* factory (captureAppError funnel)
        </button>
        <button
          type="button"
          onClick={throwServerError}
          className="cursor-pointer rounded-full border border-border bg-secondary px-4 py-2 font-semibold text-foreground"
        >
          Throw server error (onRequestError) — {serverStatus}
        </button>
        <button
          type="button"
          onClick={() => setThrowOnRender(true)}
          className="cursor-pointer rounded-full border border-border bg-secondary px-4 py-2 font-semibold text-foreground"
        >
          Throw AppError from render (app/error.tsx boundary)
        </button>
      </div>
      <RenderThrower shouldThrow={throwOnRender} />
      <p className="mt-6 text-sm text-muted-foreground">
        Verify in Sentry: readable stack trace (source maps), <code>environment</code> tag matches the deploy target,
        and the factory event has <code>error.category=Validation</code>, <code>error.service=Local</code>,{' '}
        <code>error.operation=sentryTestPage.throwViaFactory</code> tags.
      </p>
    </main>
  );
}
