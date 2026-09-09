import { isPubkyIdentifier, stripPubkyPrefix } from '@/libs/utils/utils';

/**
 * Route-boundary id normalization for the crawl-facing dynamic routes
 * (`/profile/[pubky]`, `/post/[userId]/[postId]`, `/collections/[userId]/[postId]`
 * and their `opengraph-image` / `twitter-image` segments).
 *
 * Bots and link previews append trailing punctuation to the last URL path
 * segment (sentence-boundary dots, closing brackets, commas, quotes) and
 * percent-encode or double-encode segments. Nexus 400s on such ids and the OG
 * route reported each failure to Sentry (PUBKY-APP-1E/9Z/A0/BQ). Pubky ids are
 * strict z-base-32 (52 lowercase alphanumerics), so malformed variants are
 * rejected here instead of being passed downstream: callers treat `null` as
 * the fallback path, which costs zero Nexus round-trips and zero Sentry events.
 */

/** `decodeURIComponent` without throwing on malformed input (`'abc%'`). */
export function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Normalizes a profile id route param.
 * Returns `null` when the id cannot decode or is not a valid pubky identifier.
 */
export function normalizeProfileId(raw: string): string | null {
  const decoded = safeDecode(raw);
  if (decoded === null) return null;
  const id = stripPubkyPrefix(decoded.trim());
  return isPubkyIdentifier(id) ? id : null;
}

/**
 * Normalizes the user/post id pair of a post route param.
 * Returns `null` when either id cannot decode or is not usable: the user id
 * must be a valid pubky identifier and the post id must start and end with an
 * alphanumeric character.
 */
export function normalizePostIds(rawUserId: string, rawPostId: string): { userId: string; postId: string } | null {
  const decodedUserId = safeDecode(rawUserId);
  const decodedPostId = safeDecode(rawPostId);
  if (decodedUserId === null || decodedPostId === null) return null;

  const userId = stripPubkyPrefix(decodedUserId.trim());
  if (!isPubkyIdentifier(userId)) return null;

  const postId = decodedPostId.trim();
  // A post id is opaque to this layer (short id), but punctuation glued to it
  // by crawlers is never part of one. Mid-id characters stay untouched.
  if (postId.length === 0 || /^[^a-z0-9]|[^a-z0-9]$/i.test(postId)) return null;

  return { userId, postId };
}
