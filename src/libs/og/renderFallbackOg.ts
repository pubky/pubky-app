import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDefaultUrl, getPreviewImage } from '@/config/metadata';
import { Logger } from '@/libs/logger/logger';
import { OG_CACHE_HEADERS, OG_REVALIDATE } from './ogConstants';

/** Content types for the preview asset, keyed by lowercase file extension. */
const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Fallback used whenever the data needed for a richer OG card is missing or an
 * error is thrown. Serves the app's configured default preview image
 * (`getPreviewImage()`) as direct image bytes: social crawlers (X's in
 * particular) fetch the og:image URL once and drop the card image when the
 * response is a redirect instead of an image, so a `Location` hop never
 * surfaces as the generic card.
 *
 * Deliberately independent of the satori/font render pipeline so it still
 * succeeds even when that pipeline is the thing that failed: a relative
 * preview path is read straight from `public/` on disk (the Docker image
 * copies `public/` next to the standalone server, so `process.cwd()` resolves
 * in both dev and production), and an absolute `http(s)` preview URL is
 * proxied with a cached fetch. Only when the bytes cannot be produced at all
 * does it degrade to a 307 redirect, resolved against the configured site URL
 * so the emitted `Location` is always absolute.
 */
export async function renderFallbackOg(): Promise<Response> {
  const preview = getPreviewImage();
  const isAbsolute = /^https?:\/\//.test(preview);

  try {
    const image = isAbsolute ? await fetchPreviewImage(preview) : await readPublicPreviewImage(preview);
    if (image) {
      return new Response(image.bytes, { headers: { 'content-type': image.contentType, ...OG_CACHE_HEADERS } });
    }
  } catch (error) {
    Logger.warn('[renderFallbackOg] Failed to serve fallback preview image bytes', { preview, error });
  }

  const url = isAbsolute ? preview : new URL(preview, getDefaultUrl()).toString();
  return Response.redirect(url, 307);
}

/** Reads a `public/`-relative preview path from disk. */
async function readPublicPreviewImage(preview: string): Promise<{ bytes: BodyInit; contentType: string } | null> {
  const contentType = PREVIEW_CONTENT_TYPES[path.extname(preview).toLowerCase()];
  if (!contentType) {
    Logger.warn('[renderFallbackOg] Preview image has no recognized image extension', { preview });
    return null;
  }
  const bytes = await readFile(path.join(process.cwd(), 'public', preview));
  // Copy the Buffer into a plain Uint8Array — Node's Buffer is not assignable
  // to the DOM `BodyInit` type.
  return { bytes: Uint8Array.from(bytes), contentType };
}

/** Fetches an absolute preview URL and passes its bytes through. */
async function fetchPreviewImage(preview: string): Promise<{ bytes: BodyInit; contentType: string } | null> {
  const res = await fetch(preview, { next: { revalidate: OG_REVALIDATE } });
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.startsWith('image/')) {
    Logger.warn('[renderFallbackOg] Preview image fetch did not return an image', {
      preview,
      status: res.status,
      contentType,
    });
    return null;
  }
  return { bytes: await res.arrayBuffer(), contentType };
}
