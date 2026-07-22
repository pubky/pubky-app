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
 * Exported so sibling server-only helpers (e.g. the OG image data layer in
 * `@/libs/og/ogData`) share a single Nexus fetch + error-mapping path.
 */
export async function fetchWithValidation<T>(url: string, operation: string): Promise<T | null> {
  const res = await fetch(url, { next: { revalidate: 3600 } });
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
