import sharp from 'sharp';
import { Logger } from '@/libs/logger/logger';
import { fetchWithValidation } from '@/libs/post/postMetadata';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import { filesApi } from '@/services/nexus/file/file.api';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusTag, NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import { postApi } from '@/services/nexus/post/post.api';
import { userApi } from '@/services/nexus/user/user.api';
import { OG_REVALIDATE } from './ogConstants';

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
 * Fetches a post's tags for the collection OG card. Failures are non-fatal —
 * the card simply renders without the tag row — so any error (404, network,
 * Nexus outage) collapses to an empty list instead of propagating.
 */
export async function fetchPostTags(userId: string, postId: string, limit: number): Promise<NexusTag[]> {
  try {
    const tags = await fetchWithValidation<NexusTag[]>(
      postApi.tags({ author_id: userId, post_id: postId, limit_tags: limit }),
      'fetchPostTags',
    );
    return tags ?? [];
  } catch (error) {
    Logger.warn('[ogData] Failed to fetch post tags for OG', { userId, postId, error });
    return [];
  }
}

/**
 * Resolves a post attachment reference into an absolute CDN URL the OG image
 * renderer can load. Only `pubky://<user>/pub/pubky.app/files/<fileId>` URIs are
 * accepted — they resolve to our own CDN. Anything else (including absolute
 * `http(s)` URLs) is rejected, so the server-side image fetch can never be
 * pointed at an arbitrary/internal host (SSRF). In practice every post attachment
 * is a homeserver file URI, so this reflects reality rather than restricting it.
 *
 * Uses only pure primitives (avoids the Dexie-tainted `FileController.getFileUrl`).
 * Returns `null` on any empty / non-pubky / malformed input so the caller can
 * fall back gracefully.
 */
export function resolvePostAttachmentUrl(
  attachmentUri: string | null | undefined,
  variant: FileVariant = FileVariant.FEED,
): string | null {
  const trimmed = attachmentUri?.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('pubky://')) {
    Logger.warn('[ogData] Rejected non-pubky attachment (only CDN file URIs are fetched)', { uri: trimmed });
    return null;
  }

  try {
    const compositeId = buildCompositeIdFromPubkyUri({
      uri: trimmed as Pubky,
      domain: CompositeIdDomain.FILES,
    });
    if (!compositeId) return null;
    const { pubky, id } = parseCompositeId(compositeId);
    return filesApi.getFileUrl({ pubky, file_id: id, variant });
  } catch (error) {
    Logger.warn('[ogData] Failed to resolve attachment pubky URI', { uri: trimmed, error });
    return null;
  }
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
 * Fetches a remote image, transcodes it to PNG, and returns it as a base64
 * `data:` URI — or `null` on any failure (missing URL, network error, non-2xx,
 * decode failure).
 *
 * Two reasons this is done up-front rather than letting satori fetch `<img src>`
 * directly:
 *   1. satori fetches lazily while the response streams, so a broken URL surfaces
 *      as an un-catchable 500 at stream time. Pre-fetching keeps every remote
 *      fetch inside catchable async code.
 *   2. The Pubky CDN serves WebP, which satori cannot decode ("u2 is not
 *      iterable"). sharp transcodes WebP/JPEG/PNG → PNG (preserving alpha for
 *      avatars) and downscales to bound the payload.
 */
export async function fetchImageAsDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: OG_REVALIDATE } });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;

    const input = Buffer.from(await res.arrayBuffer());
    const png = await sharp(input)
      .resize({ width: OG_IMAGE_MAX_EDGE, height: OG_IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (error) {
    Logger.warn('[ogData] Failed to fetch/transcode image for OG', { url, error });
    return null;
  }
}
