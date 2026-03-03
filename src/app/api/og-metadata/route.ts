import { NextRequest, NextResponse } from 'next/server';
import * as Core from '@/core';
import * as Libs from '@/libs';

/**
 * API Route for secure OpenGraph metadata fetching.
 *
 * Uses GET to enable HTTP caching on CDN/Edge.
 * All validation, SSRF protection, and parsing are handled by the controller layer.
 */

const CACHE_HEADERS = {
  headers: {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    const metadata = await Core.OgMetadataController.fetch({ url });

    return NextResponse.json(metadata, CACHE_HEADERS);
  } catch (error) {
    return Libs.handleApiError(error, 'api.og-metadata.GET', {
      unknownErrorMessage: 'Internal server error',
    });
  }
}
