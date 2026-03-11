'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import type { TagsLayout } from '../../PostMain/PostMain.types';

interface TimelinePostRepliesProps {
  postId: string;
  onPostClick: (postId: string) => void;
  tagsLayout?: TagsLayout;
}

/**
 * TimelinePostReplies
 *
 * Renders replies for a specific post in the timeline with thread connectors (flat structure, 1 level).
 * This component shows a preview of up to 3 replies inline with the parent post.
 * It does NOT use pagination - for full replies view, see RepliesWithParent.
 *
 * Hidden for unauthenticated users following pubky-app pattern.
 */

export function TimelinePostReplies({ postId, onPostClick, tagsLayout }: TimelinePostRepliesProps) {
  const { isAuthenticated } = Hooks.useRequireAuth();
  const [replyIds, setReplyIds] = useState<string[]>([]);
  const { mutedUserIdSet } = Hooks.useMutedUsers();

  // Watch for changes in post_counts to trigger refetch when replies count changes
  const postCounts = useLiveQuery(async () => {
    try {
      return await Core.PostController.getCounts({ compositeId: postId });
    } catch (error) {
      Libs.Logger.error('[PostReplies] Failed to query post counts', { postId, error });
      return null;
    }
  }, [postId]);

  // Check if parent post is deleted to determine replyability
  const { postDetails } = Hooks.usePostDetails(postId);
  const isParentDeleted = Libs.isPostDeleted(postDetails?.content);

  const fetchReplies = useCallback(
    async (repliesCount: number) => {
      try {
        const response = await Core.StreamPostsController.getOrFetchStreamSlice({
          streamId: `${Core.StreamSource.REPLIES}:${postId}`,
          streamTail: 0,
          lastPostId: undefined,
          limit: repliesCount > 3 ? 3 : repliesCount,
        });
        // Apply mute filter so inline reply preview matches timeline mute behavior.
        const filtered = Core.MuteFilter.filterPostsSafe(response.nextPageIds, mutedUserIdSet);
        setReplyIds(filtered);
      } catch (error) {
        // Silently handle errors - don't show replies if there's an issue
        Libs.Logger.error('Failed to fetch post replies:', error);
        setReplyIds([]);
      }
    },
    [postId, mutedUserIdSet],
  );

  // Prune muted replies when mute state changes without re-fetching.
  useEffect(() => {
    if (!postCounts?.replies || postCounts.replies < 1) {
      setReplyIds([]);
      return;
    }

    fetchReplies(postCounts.replies);
  }, [postId, postCounts?.replies, fetchReplies]);

  /**
   * Reactively prune replies when mute state changes.
   * This handles the case where a user mutes someone while viewing inline replies.
   * Note: We only depend on mutedUserIdSet to avoid infinite loops since setReplyIds
   * is called within this effect. The functional update ensures we always filter
   * the latest replyIds state.
   */
  useEffect(() => {
    if (mutedUserIdSet.size === 0) return;

    setReplyIds((prevReplyIds) => {
      if (prevReplyIds.length === 0) return prevReplyIds;
      const filtered = Core.MuteFilter.filterPostsSafe(prevReplyIds, mutedUserIdSet);
      // Only update if content actually changed to prevent unnecessary re-renders
      return filtered.length !== prevReplyIds.length ? filtered : prevReplyIds;
    });
  }, [mutedUserIdSet]);

  const hasReplies = replyIds && replyIds.length > 0;

  // Don't render for unauthenticated users (following pubky-app pattern)
  if (!isAuthenticated) {
    return null;
  }

  // Don't render anything if there are no replies
  if (!hasReplies) {
    return null;
  }

  const shouldShowQuickReply = !isParentDeleted;

  return (
    <Atoms.Container overrideDefaults className="ml-3">
      {replyIds.map((replyId, index) => (
        <React.Fragment key={`reply_${replyId}`}>
          <Atoms.PostThreadSpacer />
          <Organisms.PostMain
            postId={replyId}
            isReply={true}
            onClick={() => onPostClick(replyId)}
            isLastReply={index === replyIds.length - 1 && !shouldShowQuickReply}
            tagsLayout={tagsLayout}
          />
        </React.Fragment>
      ))}

      {shouldShowQuickReply && (
        <>
          <Atoms.PostThreadSpacer />
          <Organisms.QuickReply parentPostId={postId} />
        </>
      )}
    </Atoms.Container>
  );
}
