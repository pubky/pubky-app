import { NEXUS_SERVER_FETCH_TIMEOUT_MS } from '@/config/nexus';
import { httpResponseToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import type { NexusPostDetails, NexusUserDetails } from '@/services/nexus/nexus.types';
import { postApi } from '@/services/nexus/post/post.api';
import { userApi } from '@/services/nexus/user/user.api';

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
  // Crawl-trim: bots and link previews frequently append a trailing dot to the
  // last URL path segment (Sentence boundary / ellipsis). Nexus 400s on the
  // malformed id and the OG route then reported the failure to Sentry
  // (PUBKY-APP-1E/9Z/A0/BQ, URLs like `...m86y./opengraph-image`). Trailing
  // dots are never valid in z-base-32 pubky ids or composite post ids.
  const cleanUserId = decodeURIComponent(userId).replace(/[.\s]+$/, '');
  const cleanPostId = decodeURIComponent(postId).replace(/[.\s]+$/, '');
  const [user, post] = await Promise.all([
    fetchWithValidation<NexusUserDetails>(userApi.details({ user_id: cleanUserId }), 'fetchUserDetails'),
    fetchWithValidation<NexusPostDetails>(
      postApi.details({ author_id: cleanUserId, post_id: cleanPostId }),
      'fetchPostDetails',
    ),
  ]);

  if (!user || !post) return null;
  return { user, post };
}
