import { FileController } from '@/controllers/file/file';
import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { FileVariant } from '@/services/nexus/file/file.types';

/**
 * Resolves a Collection envelope's `cover_image` field into a URL the
 * browser can actually load.
 *
 * The envelope value is a free-form string and may be:
 *   - An absolute web URL (http(s)://...) — returned as-is.
 *   - A homeserver `pubky://<user>/pub/pubky.app/files/<fileId>` URI —
 *     resolved to a CDN URL via `FileController.getFileUrl`, using the
 *     `variant` the caller is sized for (e.g. `FEED` for cards, `MAIN`
 *     for the single-collection hero).
 *   - Anything else (empty / null / malformed) — returns `null` so the
 *     consumer can fall back to a default background.
 *
 * Without this, dropping a `pubky://` URI into `background-image: url(...)`
 * or `<img src=...>` yields `net::ERR_UNKNOWN_URL_SCHEME` — the browser
 * has no native handler for the `pubky` scheme.
 *
 * Lives in its own module (not `collectionContent.ts`) because it depends on
 * `FileController`: the pure envelope parser is consumed by the application
 * layer, which must stay free of Controller imports (see AGENTS.md layering).
 * UI layers importing this module keep their controller dependency legal. If
 * other surfaces (post attachments, profile heroes, etc.) start consuming
 * `pubky://` *file* URIs, consider extracting a generic
 * `pubkyUriToCdnUrl(uri, variant)` into `src/libs/file/`.
 *
 * @param raw      Envelope `cover_image` value from Nexus (may be null /
 *                 undefined / non-URL string if the backend shape drifts).
 * @param variant  CDN file variant to request when resolving a `pubky://`
 *                 URI. Has no effect on absolute URLs.
 */
export function resolveCollectionCoverImage(
  raw: string | null | undefined,
  variant: FileVariant = FileVariant.FEED,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('pubky://')) {
    // Absolute URL path. Values come from Nexus, but we still normalize via
    // WHATWG URL + scheme allow-list so the consumer only ever receives a
    // well-formed http(s) URL it can actually load — a cheap guard against
    // backend shape drift. Non-http(s) schemes (`data:`, `file:`, stray
    // `pubky://`, etc.) and malformed strings are rejected here so the call
    // site falls back to a default background instead of firing a broken
    // image request.
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        Logger.warn('[collectionCoverImage] Rejected cover_image with disallowed scheme', {
          uri: trimmed,
          protocol: parsed.protocol,
        });
        return null;
      }
      return parsed.toString();
    } catch (error) {
      Logger.warn('[collectionCoverImage] Rejected malformed cover_image URL', { uri: trimmed, error });
      return null;
    }
  }

  try {
    const compositeId = buildCompositeIdFromPubkyUri({
      uri: trimmed as Pubky,
      domain: CompositeIdDomain.FILES,
    });
    if (!compositeId) return null;
    return FileController.getFileUrl({ fileId: compositeId, variant });
  } catch (error) {
    Logger.warn('[collectionCoverImage] Failed to resolve cover_image pubky URI', { uri: trimmed, error });
    return null;
  }
}
