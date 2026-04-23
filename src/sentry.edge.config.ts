/**
 * Sentry init for the Edge runtime (middleware + edge route handlers).
 *
 * As of this commit the app has no edge endpoints — there is no `middleware.ts`
 * and no route uses `export const runtime = 'edge'`. This file is kept on purpose:
 * the moment anyone introduces middleware or an edge route, errors will be captured
 * automatically via `instrumentation.ts`'s NEXT_RUNTIME === 'edge' branch — no
 * follow-up PR required.
 */
import * as Sentry from '@sentry/nextjs';
import { getSentryInitBase, shouldEnableSentry } from '@/libs/observability/sentry';

if (shouldEnableSentry()) {
  Sentry.init({
    ...getSentryInitBase(),
  });
}
