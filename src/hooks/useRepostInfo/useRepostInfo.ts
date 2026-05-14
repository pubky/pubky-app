'use client';

import { PostController } from '@/controllers/post/post';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import type { UseRepostInfoResult } from './useRepostInfo.types';

/**
 * Hook to get repost information for a post.
 * Checks if a post is a repost and identifies who reposted it.
 * If the post relationships are not in cache, it will trigger a fetch from Nexus.
 *
 * Uses the local-first query pattern (ADR-0011) via `useLocalFirstQuery`:
 * 1. fetchFn (useEffect): Ensures data exists (fetch full entity from Nexus if missing)
 * 2. queryFn (useLiveQuery): Reads current data reactively from local DB
 *
 * **Usage by Component:**
 * - **PostContent**: Uses `isRepost` and `originalPostId` to render repost preview
 * - **PostMain**: Uses `isRepost` and `isCurrentUserRepost` to show repost header
 *
 * @param postId - Composite post ID in format "authorId:postId"
 * @returns Repost information including whether it's a repost, repost author ID, original post ID, and if current user reposted
 *
 * @example
 * ```tsx
 * // In PostContent - for repost preview
 * const { isRepost, originalPostId } = useRepostInfo(postId);
 * if (isRepost && originalPostId) {
 *   return <PostPreviewCard postId={originalPostId} />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // In PostMain - for repost header
 * const { isRepost, isCurrentUserRepost } = useRepostInfo(postId);
 * if (isRepost && isCurrentUserRepost) {
 *   return <RepostHeader onUndo={deletePost} />;
 * }
 * ```
 */
export function useRepostInfo(postId: string): UseRepostInfoResult {
  const { currentUserPubky } = useCurrentUserProfile();

  // Read relationships via controller using local-first pattern
  const { data: relationships, isLoading } = useLocalFirstQuery<PostRelationshipsModelSchema>({
    queryFn: () => PostController.getRelationships({ compositeId: postId }),
    fetchFn: () => PostController.fetch({ compositeId: postId }),
    deps: [postId],
    enabled: !!postId,
  });

  const isRepost = !!relationships?.reposted;
  const hasError = !!postId && relationships === null && !isLoading;

  // Extract original post ID from reposted URI
  let originalPostId: string | null = null;
  if (relationships?.reposted) {
    originalPostId = buildCompositeIdFromPubkyUri({
      uri: relationships.reposted,
      domain: CompositeIdDomain.POSTS,
    });

    if (!originalPostId) {
      Logger.error('[useRepostInfo] Failed to build composite ID from reposted URI', {
        postId,
        repostedUri: relationships.reposted,
      });
    }
  }

  // Extract repost author ID from post ID
  let repostAuthorId: string | null = null;
  if (isRepost) {
    try {
      repostAuthorId = parseCompositeId(postId).pubky;
    } catch (error) {
      Logger.error('[useRepostInfo] Failed to parse composite post ID', {
        postId,
        error,
      });
    }
  }

  const isCurrentUserRepost = repostAuthorId !== null && currentUserPubky === repostAuthorId;

  return {
    isRepost,
    repostAuthorId,
    isCurrentUserRepost,
    originalPostId,
    isLoading,
    hasError,
  };
}
