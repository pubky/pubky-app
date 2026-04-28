'use client';

import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import * as Core from '@/core';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { UseRepostInfoResult } from './useRepostInfo.types';
import { Logger } from '@/libs/logger/logger';

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
  const { data: relationships, isLoading } = useLocalFirstQuery<Core.PostRelationshipsModelSchema>({
    queryFn: () => Core.PostController.getRelationships({ compositeId: postId }),
    fetchFn: () => Core.PostController.fetch({ compositeId: postId }),
    deps: [postId],
    enabled: !!postId,
  });

  const isRepost = !!relationships?.reposted;
  const hasError = !!postId && relationships === null && !isLoading;

  // Extract original post ID from reposted URI
  let originalPostId: string | null = null;
  if (relationships?.reposted) {
    originalPostId = Core.buildCompositeIdFromPubkyUri({
      uri: relationships.reposted,
      domain: Core.CompositeIdDomain.POSTS,
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
      repostAuthorId = Core.parseCompositeId(postId).pubky;
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
