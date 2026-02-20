import { NextRequest, NextResponse } from 'next/server';

/**
 * Video proxy for iOS Safari Content-Type fix
 *
 * Nexus serves video with Content-Type: application/octet-stream, which
 * causes MEDIA_ERR_SRC_NOT_SUPPORTED on iOS WebKit. This proxy fetches
 * from Nexus and re-sends with Content-Type: video/mp4 for verification.
 *
 * Only proxies URLs from nexus.*.pubky.app. Forward Range headers for
 * proper iOS video streaming support.
 */
const NEXUS_HOST_PATTERN = /^nexus\.[a-z0-9-]+\.[a-z0-9.-]+$/i;

function isAllowedNexusUrl(url: URL): boolean {
  return url.protocol === 'https:' && NEXUS_HOST_PATTERN.test(url.hostname);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get('url');

  if (!urlParam || typeof urlParam !== 'string') {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!isAllowedNexusUrl(targetUrl)) {
    return NextResponse.json({ error: 'URL must be from nexus.*.pubky.app' }, { status: 403 });
  }

  const rangeHeader = request.headers.get('range');
  const fetchHeaders: HeadersInit = {
    'User-Agent': request.headers.get('user-agent') ?? 'Mozilla/5.0 (compatible; PubkyVideoProxy/1.0)',
  };
  if (rangeHeader) {
    fetchHeaders['Range'] = rangeHeader;
  }

  const response = await fetch(targetUrl.toString(), {
    headers: fetchHeaders,
    redirect: 'follow',
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Upstream fetch failed' }, { status: response.status });
  }

  const contentType = response.headers.get('content-type') ?? 'video/mp4';
  const contentRange = response.headers.get('content-range');
  const contentLength = response.headers.get('content-length');
  const acceptRanges = response.headers.get('accept-ranges') ?? 'bytes';

  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': acceptRanges,
    'Cache-Control': 'public, max-age=86400',
  });
  if (contentRange) headers.set('Content-Range', contentRange);
  if (contentLength) headers.set('Content-Length', contentLength);

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
