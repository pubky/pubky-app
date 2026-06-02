import type { PubkyAppCollectionContent } from 'pubky-app-specs';
import { FileController } from '@/controllers/file/file';
import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { FileVariant } from '@/services/nexus/file/file.types';

/**
 * Re-export the canonical Collection content envelope type from `pubky-app-specs`
 * so consumers can import the type and the parser from a single project module.
 *
 * Shape (per the specs package, `>= 0.5.2-rc2`):
 *   - `name: string` (required)
 *   - `description: string | undefined`
 *   - `items?: string[]` (TS-optional for forward-compat; runtime validator
 *     produces an array)
 *   - `cover_image: string | undefined`
 */
export type { PubkyAppCollectionContent } from 'pubky-app-specs';

/**
 * Parses a Collection post's `content` JSON envelope into `PubkyAppCollectionContent`.
 *
 * Returns `null` when:
 *   - `raw` is null / undefined / empty
 *   - JSON parse fails
 *   - the parsed value isn't an object with a string `name`
 *
 * Input tolerance: accepts `null` or missing values on optional fields and
 * normalizes them to `undefined` to match the canonical type. `items` is
 * normalized to `undefined` when missing (the type marks it optional);
 * callers that need a definite array should default with `?? []`.
 *
 * Pure function — safe to call from any layer (UI, services, models).
 */
export function parseCollectionContent(raw: string | null | undefined): PubkyAppCollectionContent | null {
  if (!raw) return null;

  let content: Partial<PubkyAppCollectionContent>;
  try {
    content = JSON.parse(raw) as Partial<PubkyAppCollectionContent>;
  } catch {
    return null;
  }

  if (!content || typeof content !== 'object') return null;
  if (typeof content.name !== 'string') return null;

  return {
    name: content.name,
    description: typeof content.description === 'string' ? content.description : undefined,
    items: Array.isArray(content.items) ? content.items : undefined,
    cover_image: typeof content.cover_image === 'string' ? content.cover_image : undefined,
  };
}

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
 * Lives next to `parseCollectionContent` because both belong to the
 * collection-envelope domain; if other surfaces (post attachments,
 * profile heroes, etc.) start consuming `pubky://` *file* URIs, consider
 * extracting a generic `pubkyUriToCdnUrl(uri, variant)` into
 * `src/libs/file/`.
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
        Logger.warn('[collectionContent] Rejected cover_image with disallowed scheme', {
          uri: trimmed,
          protocol: parsed.protocol,
        });
        return null;
      }
      return parsed.toString();
    } catch (error) {
      Logger.warn('[collectionContent] Rejected malformed cover_image URL', { uri: trimmed, error });
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
    Logger.warn('[collectionContent] Failed to resolve cover_image pubky URI', { uri: trimmed, error });
    return null;
  }
}
