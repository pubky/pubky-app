import {
  NEXUS_MENTION_LOOKUP_LIMIT,
  NEXUS_MENTION_LOOKUP_TIMEOUT_MS,
  NEXUS_SERVER_FETCH_TIMEOUT_MS,
} from '@/config/nexus';
import { httpResponseToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { resolveUserDisplayName } from '@/libs/utils/utils';
import type { NexusPostDetails, NexusUserDetails } from '@/services/nexus/nexus.types';
import { postApi } from '@/services/nexus/post/post.api';
import { userApi } from '@/services/nexus/user/user.api';
import { formatMentionLabel, type MentionSegment, splitMentions, truncateSegmentsByGraphemes } from './postMentions';

/**
 * Server-side fetch with Next.js caching and proper error handling.
 * Used for SSR/ISR metadata generation where client-side services are not available.
 *
 * Bounded by `NEXUS_SERVER_FETCH_TIMEOUT_MS`: a timeout rejects like any other
 * network error, so callers' existing catch paths (generic metadata, the OG
 * fallback card) engage before a crawler abandons the request.
 *
 * Exported so sibling server-only helpers (e.g. the OG image data layer in
 * `@/libs/og/ogData`) share a single Nexus fetch + error-mapping path.
 */
export async function fetchWithValidation<T>(url: string, operation: string): Promise<T | null> {
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(NEXUS_SERVER_FETCH_TIMEOUT_MS),
  });
  if (res.status === HttpStatusCode.NOT_FOUND) {
    return null;
  }
  if (!res.ok) {
    throw httpResponseToError(res, ErrorService.Nexus, operation, url);
  }
  return res.json();
}

/**
 * Concurrently fetches user and post details for use in `generateMetadata`.
 * Returns `null` when either resource is missing so callers can fall back to
 * empty metadata in a single guard.
 */
export async function fetchUserAndPostForMetadata(
  userId: string,
  postId: string,
): Promise<{ user: NexusUserDetails; post: NexusPostDetails } | null> {
  const [user, post] = await Promise.all([
    fetchWithValidation<NexusUserDetails>(userApi.details({ user_id: userId }), 'fetchUserDetails'),
    fetchWithValidation<NexusPostDetails>(postApi.details({ author_id: userId, post_id: postId }), 'fetchPostDetails'),
  ]);

  if (!user || !post) return null;
  return { user, post };
}

/**
 * Best-effort lookup of a mentioned user's display name. Unlike
 * `fetchWithValidation` it never throws: every failure (non-OK status, timeout,
 * network error, malformed body) is an expected outcome that renders the
 * shortened key, so it is handled here before an `Err.*` factory could log and
 * report it — a Nexus wobble must not emit one Sentry event per mention per
 * surface (docs/sentry.md). An unknown or deindexed key (404) is silent; other
 * failures warn once. Runs under `NEXUS_MENTION_LOOKUP_TIMEOUT_MS`, shorter than
 * the primary fetch, so a decoration never adds a full Nexus timeout to a
 * crawler's wait or pushes the OG render past its deadline.
 */
type MentionLookup = { name: string | null; failure?: string };

async function fetchMentionedUserName(pubky: string): Promise<MentionLookup> {
  const url = userApi.details({ user_id: pubky });
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(NEXUS_MENTION_LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Drop the unread body so undici returns the socket to its pool.
      await res.body?.cancel();
      return { name: null, failure: res.status === HttpStatusCode.NOT_FOUND ? undefined : `HTTP ${res.status}` };
    }
    const user: NexusUserDetails = await res.json();
    // A tombstone resolves to `[DELETED]` (as `PostMentions` renders it); a live user without a
    // name resolves to `''` and stays a shortened key via `formatMentionLabel`.
    return { name: resolveUserDisplayName(user) || null };
  } catch (error) {
    return { name: null, failure: describeFailure(error) };
  }
}

/** A short label for a failed lookup: the error's name (`TimeoutError`, `TypeError`) when it has one. */
function describeFailure(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
    ? error.name
    : String(error);
}

/** Shortest label a mention can resolve to (`@` plus one character). */
const SHORTEST_MENTION_LABEL = '@x';

/**
 * Splits `content` into plain runs and mentions, with each raw `pk:<key>` /
 * `pubky<key>` mention resolved to the label the app renders for it
 * (`PostMentions`): `@name`, or the shortened key when the profile is missing,
 * has no name, or fails to load. The OG image renders the mention runs in the
 * brand colour; `resolveMentionsForMetadata` flattens them for the `<meta>`
 * description. One code path, so the two never disagree on a name.
 *
 * Only mentions that can appear within the first `visibleGraphemes` of the
 * rendered text are looked up: with the shortest possible label in place of
 * every token, whatever survives that window is the set worth a round-trip,
 * and a mention past it cannot become visible with a longer label. Lookups run
 * concurrently, at most `NEXUS_MENTION_LOOKUP_LIMIT` of them; the rest, and
 * every failed lookup, render as shortened keys.
 */
export async function resolveMentionSegmentsForMetadata(
  content: string,
  visibleGraphemes: number,
): Promise<MentionSegment[]> {
  const visible = truncateSegmentsByGraphemes(
    splitMentions(content, () => SHORTEST_MENTION_LABEL),
    visibleGraphemes,
  );
  const pubkys = [...new Set(visible.flatMap((segment) => (segment.isMention ? [segment.pubky] : [])))].slice(
    0,
    NEXUS_MENTION_LOOKUP_LIMIT,
  );

  const names = new Map<string, string>();
  const failed: Record<string, string> = {};
  await Promise.all(
    pubkys.map(async (pubky) => {
      const { name, failure } = await fetchMentionedUserName(pubky);
      if (name) names.set(pubky, name);
      if (failure) failed[pubky] = failure;
    }),
  );
  // One line per render rather than one per failed lookup: a mention-heavy post
  // resolves on three surfaces per page view.
  if (Object.keys(failed).length > 0) {
    Logger.warn('[postMetadata] Mention lookups failed; showing shortened keys', { failed });
  }

  return splitMentions(content, (pubky) => formatMentionLabel({ pubky, name: names.get(pubky) }));
}

/**
 * `resolveMentionSegmentsForMetadata` flattened to a string, for the `<meta>`
 * description, so a link shared elsewhere never shows a 52-character key.
 */
export async function resolveMentionsForMetadata(content: string, visibleGraphemes: number): Promise<string> {
  const segments = await resolveMentionSegmentsForMetadata(content, visibleGraphemes);
  return segments.map((segment) => segment.text).join('');
}
