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
 *
 * One crawler artefact is stripped rather than rejected: literal escape
 * sequences. A scraper that resolved its own JSON/HTML copy of a URL hands the
 * route the two characters `\` + `n` (`%5Cn%5Cn`), so the id ends in text that
 * survives `trim()` and still starts and ends alphanumeric — it slipped past
 * the shape checks and Nexus 400'd on it. Removing the sequence recovers the
 * real id for the legitimate request.
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
 * Removes crawler-appended literal escape sequences (`\n`, `\r`, `\t`) and
 * their double-escaped forms (`\\n`): one or more backslashes followed by the
 * letter of the sequence. Ids are bare z-base-32 strings, so a backslash is
 * never part of one.
 */
export function stripEscapeSequences(value: string): string {
  return value.replace(/\\+[nrt]/g, '');
}

/**
 * Decodes a raw route segment, strips escape sequences and trims it.
 * Returns `null` when the segment cannot be decoded at all.
 */
function normalizeSegment(raw: string): string | null {
  const decoded = safeDecode(raw);
  if (decoded === null) return null;
  // Strip before trimming: a crawler can append an escape sequence after the
  // whitespace (`id\n `), and only stripping exposes that trailing space.
  return stripEscapeSequences(decoded).trim();
}

/**
 * Normalizes a profile id route param.
 * Returns `null` when the id cannot decode or is not a valid pubky identifier.
 */
export function normalizeProfileId(raw: string): string | null {
  const segment = normalizeSegment(raw);
  if (segment === null) return null;
  const id = stripPubkyPrefix(segment);
  return isPubkyIdentifier(id) ? id : null;
}

/**
 * Normalizes the user/post id pair of a post route param.
 * Returns `null` when either id cannot decode or is not usable: the user id
 * must be a valid pubky identifier and the post id must start and end with an
 * alphanumeric character.
 */
export function normalizePostIds(rawUserId: string, rawPostId: string): { userId: string; postId: string } | null {
  const userSegment = normalizeSegment(rawUserId);
  const postId = normalizeSegment(rawPostId);
  if (userSegment === null || postId === null) return null;

  const userId = stripPubkyPrefix(userSegment);
  if (!isPubkyIdentifier(userId)) return null;

  // A post id is opaque to this layer (short id), but punctuation glued to it
  // by crawlers is never part of one. Mid-id characters stay untouched.
  if (postId.length === 0 || /^[^a-z0-9]|[^a-z0-9]$/i.test(postId)) return null;

  return { userId, postId };
}
