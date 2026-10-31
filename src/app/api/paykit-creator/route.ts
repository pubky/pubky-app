import { NextRequest, NextResponse } from 'next/server';
import { PaykitCreatorController } from '@/controllers/paykit-creator/paykit-creator';
import { handleApiError } from '@/libs/api/route-error-handler';

/**
 * Whether the Paykit Server already holds a creator, for the browser.
 *
 * The Paykit Server sends no `Access-Control-Allow-Origin`, so a browser cannot read its answer
 * directly — this route asks server-side. The answer changes when a creator finishes a setup, so no
 * browser or CDN may keep it; the service behind it reuses an answer for seconds to spare Paykit's
 * shared rate limit.
 */
const NO_STORE_HEADERS = { headers: { 'Cache-Control': 'no-store' } };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await PaykitCreatorController.fetchCreatorHeld({
      creator: searchParams.get('creator'),
      returnTo: searchParams.get('return_to'),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.statusCode, ...NO_STORE_HEADERS });
    }

    return NextResponse.json({ held: result.held }, NO_STORE_HEADERS);
  } catch (error) {
    return handleApiError(error, 'api.paykit-creator.GET', { unknownErrorMessage: 'Internal server error' });
  }
}
