import { NEXUS_SERVER_FETCH_TIMEOUT_MS } from '@/config/nexus';
import { httpResponseToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { NexusPostDetails, NexusUserDetails } from '@/services/nexus/nexus.types';
import { postApi } from '@/services/nexus/post/post.api';
import { userApi } from '@/services/nexus/user/user.api';
import { extractMentionedPubkys, formatMentionLabel, type MentionSegment, splitMentions } from './postMentions';

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
 * Upper bound on distinct mentioned users looked up for one text. Bounds the
 * Nexus fan-out of a mention-heavy article body; mentions past it render as
 * shortened keys.
 */
const MENTION_LOOKUP_LIMIT = 10;

/**
 * Splits `content` into plain runs and mentions, with each raw `pk:<key>` /
 * `pubky<key>` mention resolved to the label the app renders for it
 * (`PostMentions`): `@name`, or the shortened key when the profile is missing,
 * has no name, or fails to load. The OG image renders the mention runs in the
 * brand colour; `resolveMentionsForMetadata` flattens them for the `<meta>`
 * description. One code path, so the two never disagree on a name.
 *
 * Lookups run concurrently through the same cached Nexus fetch as the other
 * metadata reads. A failed lookup degrades that one mention, not the preview:
 * the caller's fallback paths are reserved for the post / profile itself.
 */
export async function resolveMentionSegmentsForMetadata(content: string): Promise<MentionSegment[]> {
  const pubkys = extractMentionedPubkys(content).slice(0, MENTION_LOOKUP_LIMIT);
  const names = new Map<string, string>();

  if (pubkys.length > 0) {
    await Promise.all(
      pubkys.map(async (pubky) => {
        try {
          const user = await fetchWithValidation<NexusUserDetails>(
            userApi.details({ user_id: pubky }),
            'fetchMentionedUserDetails',
          );
          if (user?.name) names.set(pubky, user.name);
        } catch (error) {
          Logger.warn('[postMetadata] Failed to resolve a mentioned user; showing the shortened key', {
            pubky,
            error,
          });
        }
      }),
    );
  }

  return splitMentions(content, (pubky) => formatMentionLabel({ pubky, name: names.get(pubky) }));
}

/**
 * `resolveMentionSegmentsForMetadata` flattened to a string, for the `<meta>`
 * description, so a link shared elsewhere never shows a 52-character key.
 */
export async function resolveMentionsForMetadata(content: string): Promise<string> {
  const segments = await resolveMentionSegmentsForMetadata(content);
  return segments.map((segment) => segment.text).join('');
}
