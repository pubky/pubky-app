'use client';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import * as Types from './PostReplies.types';

/**
 * TimelinePostReplies
 *
 * Renders a ThreadTree for a specific post in the timeline.
 * Displays up to 3 Level 1 replies with Level 2 nested replies
 * and a global collapse/expand toggle.
 *
 * Hidden for unauthenticated users following pubky-app pattern.
 */

export function TimelinePostReplies({ postId }: Types.TimelinePostRepliesProps) {
  const { isAuthenticated } = Hooks.useRequireAuth();

  // Check if parent post is deleted to determine replyability
  const { postDetails } = Hooks.usePostDetails(postId);
  const isParentDeleted = Libs.isPostDeleted(postDetails?.content);

  const shouldShowQuickReply = !isParentDeleted;

  // Don't render for unauthenticated users (following pubky-app pattern)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <Atoms.Container overrideDefaults className="ml-3">
      <Organisms.ThreadTree postId={postId} showQuickReply={shouldShowQuickReply} />
    </Atoms.Container>
  );
}
