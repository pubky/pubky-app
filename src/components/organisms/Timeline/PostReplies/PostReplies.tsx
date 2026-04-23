'use client';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';

interface TimelinePostRepliesProps {
  postId: string;
}

/**
 * TimelinePostReplies
 *
 * Renders a ThreadTree for a specific post in the timeline.
 * Displays up to 3 Level 1 replies with Level 2 nested replies
 * and a global collapse/expand toggle.
 *
 * Hidden for unauthenticated users following pubky-app pattern.
 *
 * The surface (TimelineFeedContent) provides PostMainLayoutProvider above this
 * subtree, so the nested ThreadTree → ReplyWithNested → PostMain chain inherits
 * the active tags layout via context — no prop drilling required here.
 */

export function TimelinePostReplies({ postId }: TimelinePostRepliesProps) {
  const { isAuthenticated } = Hooks.useRequireAuth();
  const { postCounts } = Hooks.usePostCounts(postId);

  // Check if parent post is deleted to determine replyability
  const { postDetails } = Hooks.usePostDetails(postId);
  const isParentDeleted = Libs.isPostDeleted(postDetails?.content);

  const shouldShowQuickReply = !isParentDeleted;
  const hasReplies = (postCounts?.replies ?? 0) > 0;

  // Don't render for unauthenticated users or posts with no replies
  if (!isAuthenticated || !hasReplies) {
    return null;
  }

  return (
    <Atoms.Container overrideDefaults className="ml-3">
      <Organisms.ThreadTree postId={postId} showQuickReply={shouldShowQuickReply} />
    </Atoms.Container>
  );
}
