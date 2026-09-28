import sharp from 'sharp';
import { Logger } from '@/libs/logger/logger';
import { fetchWithValidation } from '@/libs/post/postMetadata';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { filesApi } from '@/services/nexus/file/file.api';
import type { NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import { userApi } from '@/services/nexus/user/user.api';
import { OG_IMAGE_FETCH_TIMEOUT_MS, OG_IMAGE_MAX_BYTES, OG_REVALIDATE } from './ogConstants';

/**
 * Server-only data helpers for dynamic OG image generation.
 *
 * IMPORTANT: this module must stay free of client/Dexie imports. Do NOT import
 * `FileController` / `FileApplication` / `resolveCollectionCoverImage` here —
 * they transitively pull `LocalFileService` → `FileDetailsModel` (Dexie), which
 * cannot run on the server. Only pure URL builders and model utils are used.
 */

const EMPTY_COUNTS: NexusUserCounts = {
  tagged: 0,
  tags: 0,
  unique_tags: 0,
  posts: 0,
  replies: 0,
  collections: 0,
  following: 0,
  followers: 0,
  friends: 0,
  bookmarks: 0,
};

/**
 * Concurrently fetches a profile's details and counts for `generateMetadata`
 * and the profile OG image. Returns `null` when the user is missing (404) so
 * callers can fall back to default metadata / a branded frame. Counts falling
 * back to zeros is non-fatal.
 */
export async function fetchProfileForMetadata(
  pubky: string,
): Promise<{ user: NexusUserDetails; counts: NexusUserCounts } | null> {
  const userId = stripPubkyPrefix(decodeURIComponent(pubky));

  const [user, counts] = await Promise.all([
    fetchWithValidation<NexusUserDetails>(userApi.details({ user_id: userId }), 'fetchUserDetails'),
    fetchWithValidation<NexusUserCounts>(userApi.counts({ user_id: userId }), 'fetchUserCounts'),
  ]);

  if (!user) return null;
  return { user, counts: counts ?? EMPTY_COUNTS };
}

/**
 * Builds the CDN avatar URL for a user, mirroring the app's own avatar
 * resolution (`FileController.getAvatarUrl`) but via the pure, server-safe
 * `filesApi` builder. `NexusUserDetails.image` is only a presence flag (a
 * `pubky://` file URI), so a falsy value means "no avatar" → `null` (the caller
 * renders the brand-circle fallback). `indexed_at` is used as a cache-busting
 * version, matching the app.
 */
export function buildAvatarUrl(user: Pick<NexusUserDetails, 'id' | 'image' | 'indexed_at'>): string | null {
  if (!user.image) return null;
  return filesApi.getAvatarUrl(user.id, user.indexed_at);
}

/** Longest-edge cap (px) applied when transcoding so the embedded PNG stays small. */
const OG_IMAGE_MAX_EDGE = 1200;

/**
 * Fetches a remote image's raw bytes for OG rendering, or `null` on any
 * failure (network error, timeout, non-2xx, non-image content type, oversized
 * body). The single fetch policy for OG image bytes — timeout, size cap, ISR
 * caching, content-type gate — shared by the card renderers and the fallback
 * path so hardening lands in one place.
 */
export async function fetchOgImageBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: OG_REVALIDATE },
      signal: AbortSignal.timeout(OG_IMAGE_FETCH_TIMEOUT_MS),
    });
    const contentType = res.headers.get('content-type') ?? '';
    const contentLength = Number(res.headers.get('content-length') ?? 0);
    // Media types are case-insensitive per RFC 9110.
    if (!res.ok || !contentType.toLowerCase().startsWith('image/') || contentLength > OG_IMAGE_MAX_BYTES) {
      // Drop the unread body so undici returns the socket to its pool.
      await res.body?.cancel();
      Logger.warn('[ogData] OG image fetch rejected', { url, status: res.status, contentType, contentLength });
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    Logger.warn('[ogData] Failed to fetch image for OG', { url, error });
    return null;
  }
}

/**
 * Fetches a remote image, transcodes it to PNG, and returns it as a base64
 * `data:` URI — or `null` on any failure (missing URL, network error, non-2xx,
 * decode failure).
 *
 * Two reasons this is done up-front rather than letting satori fetch `<img src>`
 * directly:
 *   1. satori renders (and fetches) outside the renderers' try/catch, so a
 *      broken URL would surface as a render failure instead of a graceful
 *      "no image" card. Pre-fetching keeps every remote fetch catchable here.
 *   2. The Pubky CDN serves WebP, which satori cannot decode ("u2 is not
 *      iterable"). sharp transcodes WebP/JPEG/PNG → PNG (preserving alpha for
 *      avatars) and downscales to bound the payload.
 */
export async function fetchImageAsDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const input = await fetchOgImageBytes(url);
  if (!input) return null;
  try {
    const png = await sharp(input)
      .resize({ width: OG_IMAGE_MAX_EDGE, height: OG_IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (error) {
    Logger.warn('[ogData] Failed to transcode image for OG', { url, error });
    return null;
  }
}
