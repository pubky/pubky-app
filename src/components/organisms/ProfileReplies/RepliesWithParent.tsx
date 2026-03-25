'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Types from './RepliesWithParent.types';

/**
 * RepliesWithParent
 *
 * Similar to TimelinePosts, but specifically for replies:
 * - Shows the parent post first (without reply line)
 * - Shows the reply post with isReply={true} (with reply line)
 */
export function RepliesWithParent({ streamId }: Types.RepliesWithParentProps) {
  const { postIds, loading, loadingMore, error, hasMore, loadMore } = Hooks.useStreamPagination({ streamId });
  const { navigateToPost } = Hooks.usePostNavigation();

  // Infinite scroll hook
  const { sentinelRef } = Hooks.useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
  });

  return (
    <Molecules.TimelineStateWrapper loading={loading} error={error} hasItems={postIds.length > 0}>
      <Atoms.Container>
        <Atoms.Container overrideDefaults className="space-y-4">
          {postIds.map((postId: string) => (
            <ReplyWithParent key={`reply_${postId}`} replyPostId={postId} onPostClick={navigateToPost} />
          ))}

          {/* Loading More Indicator */}
          {loadingMore && <Molecules.TimelineLoadingMore />}

          {/* Error on loading more */}
          {error && postIds.length > 0 && <Molecules.TimelineError message={error} />}

          {/* End of posts message */}
          {!hasMore && !loadingMore && postIds.length > 0 && <Molecules.TimelineEndMessage />}

          {/* Infinite scroll sentinel */}
          <Atoms.Container overrideDefaults className="h-[20px]" ref={sentinelRef} />
        </Atoms.Container>
      </Atoms.Container>
    </Molecules.TimelineStateWrapper>
  );
}

/**
 * ReplyWithParent
 *
 * Component that fetches and displays a reply post along with its parent.
 * Always shows the parent post if it exists.
 */
function ReplyWithParent({ replyPostId, onPostClick }: Types.ReplyWithParentProps) {
  // Component-level cache to track in-flight parent post fetches
  // Using useRef to avoid SSR memory leaks and state pollution
  const fetchingParentPostsRef = useRef(new Set<string>());

  // First: Get parent post ID from relationships
  // UI → Controller → Service → Model
  const parentPostId = useLiveQuery(async () => {
    try {
      const relationships = await Core.PostController.getRelationships({ compositeId: replyPostId });

      if (!relationships?.replied) {
        return null;
      }

      const parentCompositeId = Core.buildCompositeIdFromPubkyUri({
        uri: relationships.replied,
        domain: Core.CompositeIdDomain.POSTS,
      });

      return parentCompositeId;
    } catch (error) {
      Libs.Logger.error('[RepliesWithParent] Failed to query post relationships', { replyPostId, error });
      return null;
    }
  }, [replyPostId]);

  // Second: Observe parent post details reactively
  // UI → Controller → Service → Model
  const parentPost = useLiveQuery(async () => {
    try {
      if (!parentPostId) return null;

      const post = await Core.PostController.getDetails({ compositeId: parentPostId });

      return post;
    } catch (error) {
      Libs.Logger.error('[RepliesWithParent] Failed to query parent post details', { parentPostId, error });
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
      const viewerId = Core.useAuthStore.getState().selectCurrentUserPubky();
      if (!viewerId) return;
      // Parent post ID exists but post details are missing
      // Fetch via Controller (fire-and-forget, useLiveQuery will react to DB updates)
      Core.PostController.getOrFetch({ compositeId: parentPostId, viewerId })
        .catch((error) => {
          Libs.Logger.error('[RepliesWithParent] Failed to fetch parent post details', { parentPostId, error });
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
    <Atoms.Container overrideDefaults className="flex flex-col">
      {/* Show parent post if it exists */}
      {shouldShowParent && (
        <>
          <Organisms.PostMain postId={parentPostId} onClick={() => onPostClick(parentPostId)} isReply={false} />
          <Atoms.Container overrideDefaults className="pl-3">
            <Atoms.PostThreadSpacer />
          </Atoms.Container>
        </>
      )}

      {/* Show the reply with isReply={true} */}
      <Atoms.Container overrideDefaults className={shouldShowParent ? 'pl-3' : ''}>
        <Organisms.PostMain
          postId={replyPostId}
          onClick={() => onPostClick(replyPostId)}
          isReply={true}
          isLastReply={true}
        />
      </Atoms.Container>
    </Atoms.Container>
  );
}
