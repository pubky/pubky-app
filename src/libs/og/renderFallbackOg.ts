import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getDefaultUrl, getPreviewImage } from '@/config/metadata';
import { Logger } from '@/libs/logger/logger';
import { APP_RUNTIME_DEFAULTS } from '@/libs/runtime-config/runtime-config.schema';
import { OG_CONTENT_TYPE, OG_FALLBACK_CACHE_HEADERS, OG_SIZE } from './ogConstants';
import { fetchOgImageBytes } from './ogData';

/**
 * Fallback used whenever the data needed for a richer OG card is missing or an
 * error is thrown. Serves the app's configured default preview image
 * (`getPreviewImage()`) as direct image bytes: social crawlers (X's in
 * particular) fetch the og:image URL once and drop the card image when the
 * response is a redirect instead of an image, so a `Location` hop never
 * surfaces as the generic card.
 *
 * The bytes are normalized through sharp to a PNG at `OG_SIZE`, so the
 * response always matches the `contentType`/`size` the image routes declare
 * (and Next emits as `og:image:type`/`width`/`height`) regardless of the
 * configured asset's format. The result is cached for the process lifetime
 * (like `ogFonts`); failures are not cached, so transient errors retry.
 *
 * Deliberately independent of the satori/font render pipeline so it still
 * succeeds even when that pipeline is the thing that failed: a relative
 * preview path is read from `public/` on disk (the Docker image copies
 * `public/` next to the standalone server, so `process.cwd()` resolves in
 * both dev and production), and an absolute `http(s)` preview URL is fetched
 * with the shared timeout-bounded helper — degrading to the bundled default
 * asset when that remote is unreachable. Only when no bytes can be produced
 * at all does it emit a 307, and this function never itself throws: it is
 * called from the renderers' catch blocks, where a rejection would 500 the
 * route.
 */
export async function renderFallbackOg(): Promise<Response> {
  let preview: string | null = null;
  try {
    preview = getPreviewImage();
    const png = await getPreviewPng(preview);
    if (png) {
      return new Response(png, { headers: { 'content-type': OG_CONTENT_TYPE, ...OG_FALLBACK_CACHE_HEADERS } });
    }
  } catch (error) {
    Logger.warn('[renderFallbackOg] Failed to serve fallback preview image bytes', { preview, error });
  }
  return redirectResponse(preview);
}

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

/** Successful preview PNGs are immutable for the process lifetime — cached like `ogFonts`. */
let cachedPng: { key: string; png: Uint8Array<ArrayBuffer> } | null = null;

/**
 * Resolves the configured preview into a normalized `OG_SIZE` PNG, or `null`
 * when no bytes can be produced. A failed remote preview degrades to the
 * bundled default asset (cached under its own key so the remote URL itself is
 * retried on the next request).
 */
async function getPreviewPng(preview: string): Promise<Uint8Array<ArrayBuffer> | null> {
  if (cachedPng?.key === preview) return cachedPng.png;

  const isRemote = isHttpUrl(preview);
  const source = isRemote ? await fetchOgImageBytes(preview) : await readPublicFile(preview);
  if (!source) {
    return isRemote ? getPreviewPng(APP_RUNTIME_DEFAULTS.previewImage) : null;
  }

  try {
    const png = new Uint8Array(
      await sharp(source).resize({ width: OG_SIZE.width, height: OG_SIZE.height, fit: 'cover' }).png().toBuffer(),
    );
    cachedPng = { key: preview, png };
    return png;
  } catch (error) {
    Logger.warn('[renderFallbackOg] Failed to transcode preview image', { preview, error });
    return null;
  }
}

/** Reads a `public/`-relative preview path from disk, or `null` on any failure. */
async function readPublicFile(preview: string): Promise<Buffer | null> {
  // Strip a query string / fragment: a cache-busted '/preview.webp?v=2' is a
  // valid config value (Next serves it from public/ regardless).
  const cleanPath = preview.replace(/[?#].*$/, '');
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, cleanPath);
  if (!filePath.startsWith(publicDir + path.sep)) {
    Logger.warn('[renderFallbackOg] Preview path escapes public/', { preview });
    return null;
  }
  try {
    return await readFile(filePath);
  } catch (error) {
    Logger.warn('[renderFallbackOg] Failed to read preview image from public/', { preview, error });
    return null;
  }
}

/**
 * Last-resort 307. An absolute configured URL that reached this point just
 * failed to serve an image, so the redirect aims at the app's own bundled
 * asset instead of the known-dead remote. Structured so it cannot throw.
 */
function redirectResponse(preview: string | null): Response {
  try {
    const target = preview && !isHttpUrl(preview) ? preview : APP_RUNTIME_DEFAULTS.previewImage;
    const location = new URL(target, getDefaultUrl()).toString();
    return new Response(null, { status: 307, headers: { location, ...OG_FALLBACK_CACHE_HEADERS } });
  } catch (error) {
    Logger.warn('[renderFallbackOg] Failed to resolve redirect location', { preview, error });
    // A relative Location is valid per RFC 9110 §10.2.2, and this constant
    // header value cannot fail construction.
    return new Response(null, {
      status: 307,
      headers: { location: APP_RUNTIME_DEFAULTS.previewImage, ...OG_FALLBACK_CACHE_HEADERS },
    });
  }
}
