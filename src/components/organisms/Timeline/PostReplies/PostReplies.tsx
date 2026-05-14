'use client';

import { Container } from '@/atoms/Container/Container';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { isPostDeleted } from '@/libs/utils/utils';
import { ThreadTree } from '../../ThreadTree/ThreadTree';

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
  const { isAuthenticated } = useRequireAuth();
  const { postCounts } = usePostCounts(postId);

  // Check if parent post is deleted to determine replyability
  const { postDetails } = usePostDetails(postId);
  const isParentDeleted = isPostDeleted(postDetails?.content);

  const shouldShowQuickReply = !isParentDeleted;
  const hasReplies = (postCounts?.replies ?? 0) > 0;

  // Don't render for unauthenticated users or posts with no replies
  if (!isAuthenticated || !hasReplies) {
    return null;
  }

  return (
    <Container overrideDefaults className="ml-3">
      <ThreadTree postId={postId} showQuickReply={shouldShowQuickReply} />
    </Container>
  );
}
