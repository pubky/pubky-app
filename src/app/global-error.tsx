'use client';
import './globals.css';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Pulse } from '@synonymdev/pubky-pulse-web';
import { APP_VERSION } from '@/config/app';
import { PAGE_GUTTER_CLASS } from '@/config/layoutClasses';
import { claimStaleChunkReload, isChunkLoadError } from '@/libs/chunk-load/chunkLoadRecovery';
import { AppError } from '@/libs/error/error';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // A chunk the previous build served is gone after a deploy. Reload once to pick up the current
    // build; the reload is a breadcrumb rather than an error because it is expected and self-heals,
    // and it is claimed once per build so a genuinely broken build cannot loop.
    if (isChunkLoadError(error) && claimStaleChunkReload()) {
      Sentry.addBreadcrumb({
        category: 'chunk-load',
        level: 'warning',
        message: 'Reloading after a stale chunk failed to load',
        data: { build: APP_VERSION },
      });
      Logger.warn('[app/global-error] Stale chunk load failure; reloading for build', APP_VERSION);
      window.location.reload();
      return;
    }

    // global-error.tsx is caught by Next.js before Sentry's automatic handlers can see it.
    // AppError instances are already captured once by Err.* factories via captureAppError;
    // capturing again here would create duplicate events with the same fingerprint.
    if (!(error instanceof AppError)) {
      Sentry.captureException(error);
      Pulse.captureException(error);
    }
  }, [error]);

  return (
    <html lang="en" dir="ltr">
      <body className="bg-background text-foreground antialiased">
        <main
          className={cn(
            'mx-auto flex min-h-screen w-full max-w-[640px] flex-col items-center justify-center py-6 text-center',
            PAGE_GUTTER_CLASS,
          )}
        >
          <h1 className="m-0 text-[28px] leading-[1.2] font-semibold">Something went wrong</h1>
          <p className="mt-3 mb-0 text-destructive">{error.message || 'Unexpected error occurred.'}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 cursor-pointer rounded-full border border-border bg-secondary px-4 py-2 font-semibold text-foreground"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
