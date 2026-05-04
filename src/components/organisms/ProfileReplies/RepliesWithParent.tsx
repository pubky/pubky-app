'use client';

import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import { Container } from '@/atoms/Container/Container';
import { PostThreadSpacer } from '@/atoms/PostThreadSpacer/PostThreadSpacer';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { PostMain } from '../PostMain/PostMain';

import type { RepliesWithParentProps, ReplyWithParentProps } from './RepliesWithParent.types';
import { Logger } from '@/libs/logger/logger';
import { PostController } from '@/controllers/post/post';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { useAuthStore } from '@/stores/auth/auth.store';
/**
 * RepliesWithParent
 *
 * Similar to TimelinePosts, but specifically for replies:
 * - Shows the parent post first (without reply line)
 * - Shows the reply post with isReply={true} (with reply line)
 */
export function RepliesWithParent({ streamId }: RepliesWithParentProps) {
  const { postIds, loading, loadingMore, error, hasMore, loadMore } = useStreamPagination({ streamId });
  const { navigateToPost } = usePostNavigation();

  // Infinite scroll hook
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
  });

  return (
    <TimelineStateWrapper loading={loading} error={error} hasItems={postIds.length > 0}>
      <Container>
        <Container overrideDefaults className="space-y-4">
          {postIds.map((postId: string) => (
            <ReplyWithParent key={`reply_${postId}`} replyPostId={postId} onPostClick={navigateToPost} />
          ))}

          {/* Loading More Indicator */}
          {loadingMore && <TimelineLoadingMore />}

          {/* Error on loading more */}
          {error && postIds.length > 0 && <TimelineError message={error} />}

          {/* End of posts message */}
          {!hasMore && !loadingMore && postIds.length > 0 && <TimelineEndMessage />}

          {/* Infinite scroll sentinel */}
          <Container overrideDefaults className="h-[20px]" ref={sentinelRef} />
        </Container>
      </Container>
    </TimelineStateWrapper>
  );
}

/**
 * ReplyWithParent
 *
 * Component that fetches and displays a reply post along with its parent.
 * Always shows the parent post if it exists.
 */
function ReplyWithParent({ replyPostId, onPostClick }: ReplyWithParentProps) {
  // Component-level cache to track in-flight parent post fetches
  // Using useRef to avoid SSR memory leaks and state pollution
  const fetchingParentPostsRef = useRef(new Set<string>());

  // First: Get parent post ID from relationships
  // UI → Controller → Service → Model
  const parentPostId = useLiveQuery(async () => {
    try {
      const relationships = await PostController.getRelationships({ compositeId: replyPostId });

      if (!relationships?.replied) {
        return null;
      }

      const parentCompositeId = buildCompositeIdFromPubkyUri({
        uri: relationships.replied,
        domain: CompositeIdDomain.POSTS,
      });

      return parentCompositeId;
    } catch (error) {
      Logger.error('[RepliesWithParent] Failed to query post relationships', { replyPostId, error });
      return null;
    }
  }, [replyPostId]);

  // Second: Observe parent post details reactively
  // UI → Controller → Service → Model
  const parentPost = useLiveQuery(async () => {
    try {
      if (!parentPostId) return null;

      const post = await PostController.getDetails({ compositeId: parentPostId });

      return post;
    } catch (error) {
      Logger.error('[RepliesWithParent] Failed to query parent post details', { parentPostId, error });
      return null;
    }
  }, [parentPostId]);

  // Fetch parent post if missing (user-initiated action)
  // UI → Controller → Application → Services (Local + Nexus)
  useEffect(() => {
    let cancelled = false;
    const fetchingSet = fetchingParentPostsRef.current;

    if (parentPostId && !parentPost && !fetchingSet.has(parentPostId)) {
      fetchingSet.add(parentPostId);
      const viewerId = useAuthStore.getState().selectCurrentUserPubky();
      if (!viewerId) return;
      // Parent post ID exists but post details are missing
      // Fetch via Controller (fire-and-forget, useLiveQuery will react to DB updates)
      PostController.getOrFetch({ compositeId: parentPostId, viewerId })
        .catch((error) => {
          Logger.error('[RepliesWithParent] Failed to fetch parent post details', { parentPostId, error });
        })
        .finally(() => {
          // Only clean up if this effect hasn't been cancelled (component still mounted and parentPostId unchanged)
          if (!cancelled) {
            fetchingSet.delete(parentPostId);
          }
        });
    }

    // Cleanup: Mark as cancelled when effect re-runs or component unmounts
    return () => {
      cancelled = true;
    };
  }, [parentPostId, parentPost]);

  // Always show parent if it exists
  const shouldShowParent = !!parentPostId;

  return (
    <Container overrideDefaults className="flex flex-col">
      {/* Show parent post if it exists */}
      {shouldShowParent && (
        <>
          <PostMain postId={parentPostId} onClick={() => onPostClick(parentPostId)} isReply={false} />
          <Container overrideDefaults className="pl-3">
            <PostThreadSpacer />
          </Container>
        </>
      )}

      {/* Show the reply with isReply={true} */}
      <Container overrideDefaults className={shouldShowParent ? 'pl-3' : ''}>
        <PostMain postId={replyPostId} onClick={() => onPostClick(replyPostId)} isReply={true} isLastReply={true} />
      </Container>
    </Container>
  );
}
