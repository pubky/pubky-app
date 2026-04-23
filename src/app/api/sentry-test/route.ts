import { NextResponse } from 'next/server';
import { Env } from '@/libs';

/**
 * DEV/PREVIEW ONLY: Throws unconditionally to verify Sentry server-side capture
 * via the `onRequestError` hook in `src/instrumentation.ts`.
 *
 * Gated on NEXT_PUBLIC_DEBUG_MODE so production builds 404 the route.
 * Delete this file (and src/app/sentry-test/) once Sentry capture is verified.
 */
export async function GET() {
  if (!Env.NEXT_PUBLIC_DEBUG_MODE) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  throw new Error('Sentry test (server) — delete me');
}
