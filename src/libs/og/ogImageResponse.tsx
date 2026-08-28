import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';
import { OG_CACHE_HEADERS, OG_SIZE } from './ogConstants';
import { getOgFonts } from './ogFonts';

/**
 * Builds a 1200x630 PNG response with the bundled Inter Tight fonts and the
 * shared cache headers applied. Central factory so every OG route emits an
 * identically-configured image.
 *
 * The `ImageResponse` body is buffered before returning: satori renders lazily
 * while the stream is consumed, and it performs its own network fetches during
 * render (emoji SVGs from the twemoji CDN, glyph subsets for scripts the
 * bundled fonts don't cover). A failure there would otherwise surface as an
 * un-catchable mid-stream 500. Awaiting the full body here keeps every render
 * failure inside the callers' try/catch, which degrades to `renderFallbackOg`.
 * Streaming buys nothing for this route — crawlers want the complete PNG.
 */
export async function ogImageResponse(element: ReactElement): Promise<Response> {
  const res = new ImageResponse(element, {
    width: OG_SIZE.width,
    height: OG_SIZE.height,
    fonts: getOgFonts(),
    headers: OG_CACHE_HEADERS,
  });
  const body = await res.arrayBuffer();
  return new Response(body, { status: res.status, headers: res.headers });
}
