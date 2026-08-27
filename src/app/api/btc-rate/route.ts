import { NextResponse } from 'next/server';
import { HomegateController } from '@/controllers/homegate/homegate';
import { handleApiError } from '@/libs/api/route-error-handler';

/**
 * BTC/USD rate for the browser.
 *
 * The upstream rate API sends no `Access-Control-Allow-Origin`, so a browser cannot call it
 * directly — this route calls it server-side instead.
 *
 * Every viewer wants the same number, so it is cached on the CDN rather than fetched per visitor.
 * The window matches the service-layer cache.
 */
const CACHE_HEADERS = {
  headers: {
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  },
};

export async function GET() {
  try {
    const rate = await HomegateController.getBtcRate();
    return NextResponse.json(rate, CACHE_HEADERS);
  } catch (error) {
    return handleApiError(error, 'api.btc-rate.GET');
  }
}
