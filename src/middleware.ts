import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ENCODED_INTERCEPT_PREFIX = '/_next/static/chunks/app/home/%40post/';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Local experiment:
  // Rewrite only encoded intercepted-route static chunk paths to raw segment names.
  if (pathname.startsWith(ENCODED_INTERCEPT_PREFIX)) {
    const rewrittenPathname = pathname
      .replace(/%40post/gi, '@post')
      .replace(/%5BuserId%5D/gi, '[userId]')
      .replace(/%5BpostId%5D/gi, '[postId]');

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = rewrittenPathname;

    const response = NextResponse.rewrite(rewriteUrl);
    response.headers.set('x-preview-encoded-chunk-rewrite', '1');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/_next/static/chunks/app/home/:path*'],
};
