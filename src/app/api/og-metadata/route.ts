import { NextRequest, NextResponse } from 'next/server';
import { OgMetadataController } from '@/controllers/og-metadata/og-metadata';
import { handleApiError } from '@/libs/api/route-error-handler';
import { AppError } from '@/libs/error/error';

/**
 * API Route for secure OpenGraph metadata fetching.
 *
 * Uses GET to enable HTTP caching on CDN/Edge.
 * All validation, SSRF protection, and parsing are handled by the controller layer.
 */

/**
 * OG metadata is used primarily during the "URL paste" phase in the composer,
 * not at timeline render time. We keep CDN cache fairly short (5 minutes) so
 * that changes to a page's OG tags are reflected reasonably quickly, while
 * still avoiding repeated expensive fetches when the same URL is pasted by
 * multiple users in a short window. `stale-while-revalidate` extends this with
 * a 30‑minute window where slightly stale data is acceptable in exchange for
 * lower latency and backend load.
 */
const CACHE_HEADERS = {
  headers: {
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
  },
};

const NO_STORE_HEADERS = {
  headers: {
    'Cache-Control': 'no-store',
  },
};

function isExpectedOgMetadataNoStoreError(error: unknown): error is AppError {
  return (
    error instanceof AppError &&
    error.operation === 'fetchOgMetadata' &&
    error.context?.source === 'og_metadata' &&
    error.context?.cachePolicy === 'no-store' &&
    typeof error.context.statusCode === 'number'
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    const result = await OgMetadataController.fetch({ url });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.statusCode, ...NO_STORE_HEADERS });
    }

    return NextResponse.json(result.metadata, CACHE_HEADERS);
  } catch (error) {
    if (isExpectedOgMetadataNoStoreError(error)) {
      const statusCode = error.context?.statusCode;
      return NextResponse.json(
        { error: 'Failed to fetch metadata' },
        { status: typeof statusCode === 'number' ? statusCode : 500, ...NO_STORE_HEADERS },
      );
    }

    return handleApiError(error, 'api.og-metadata.GET', {
      unknownErrorMessage: 'Internal server error',
    });
  }
}
