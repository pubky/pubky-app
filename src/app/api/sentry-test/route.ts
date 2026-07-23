import { NextResponse } from 'next/server';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isSentryTestHarnessEnabled } from '@/libs/observability/sentry-test-harness';

/**
 * DEV/PREVIEW ONLY: server-side Sentry capture verification.
 *
 * - `?type=unhandled` (default): throws a plain Error that propagates out of the handler and
 *   is captured by `onRequestError` (src/instrumentation.ts) with `runtime.name=node`. Returns
 *   a 500 to the caller.
 * - `?type=factory`: routes an AppError through the `Err.*` funnel (`captureAppError`) WITHOUT
 *   rethrowing, so Sentry receives exactly one event carrying the structured `error.*` tags.
 *
 * Gated to non-production via `isSentryTestHarnessEnabled()` and never statically cached so the
 * gate is re-evaluated against the runtime Sentry environment on every request.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSentryTestHarnessEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const type = new URL(request.url).searchParams.get('type') ?? 'unhandled';

  if (type === 'factory') {
    // Created (not thrown) so the funnel captures exactly one tagged event; rethrowing would
    // let `onRequestError` capture a duplicate of the same error.
    Err.server(ServerErrorCode.INTERNAL_ERROR, 'Sentry server factory test — safe to ignore', {
      service: ErrorService.NextJsServer,
      operation: 'sentryTest.api.factory',
      context: { triggeredAt: new Date().toISOString() },
    });

    return NextResponse.json({
      captured: 'factory',
      via: 'captureAppError',
      tags: {
        'error.category': 'server',
        'error.code': ServerErrorCode.INTERNAL_ERROR,
        'error.service': ErrorService.NextJsServer,
        'error.operation': 'sentryTest.api.factory',
      },
    });
  }

  if (type === 'unhandled') {
    throw new Error('Sentry server unhandled test — safe to ignore (onRequestError)');
  }

  return NextResponse.json({ error: `Unknown type "${type}". Use "unhandled" or "factory".` }, { status: 400 });
}
