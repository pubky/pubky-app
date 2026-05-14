'use client';

import { Container } from '@/atoms/Container/Container';
import { PostThreadSpacer } from '@/atoms/PostThreadSpacer/PostThreadSpacer';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useThreadReplies } from '@/hooks/useThreadReplies/useThreadReplies';
import { ShowMoreReplies } from '@/molecules/ShowMoreReplies/ShowMoreReplies';
import { QuickReply } from '../QuickReply/QuickReply';
import { ReplyWithNested } from '../ReplyWithNested/ReplyWithNested';

interface ThreadTreeProps {
  /** The composite post ID of the parent (Level 0) post */
  postId: string;
  /** Whether to show the QuickReply input at the end */
  showQuickReply?: boolean;
}

/**
 * ThreadTree Organism
 *
 * Renders a nested tree of replies for a post (up to 3 levels deep).
 * Each reply independently manages its own expand/collapse state.
 *
 * Shared between the feed timeline and the single post page.
 */
export function ThreadTree({ postId, showQuickReply = true }: ThreadTreeProps) {
  const { navigateToPost } = usePostNavigation();
  const { replyIds, hasMore, totalCount, isExpandingAll, expandAll } = useThreadReplies(postId);

  if (replyIds.length === 0 && !hasMore) {
    // No replies -- only show quick reply if enabled
    return showQuickReply ? (
      <Container overrideDefaults>
        <PostThreadSpacer />
        <QuickReply parentPostId={postId} />
      </Container>
    ) : null;
  }

  const remaining = Math.max(0, totalCount - replyIds.length);

  return (
    <Container overrideDefaults>
      {/* Level 1 replies */}
      {replyIds.map((replyId, index) => {
        const isLastReply = index === replyIds.length - 1 && !hasMore && !showQuickReply;

        return (
          <ReplyWithNested key={replyId} replyId={replyId} isLastReply={isLastReply} onPostClick={navigateToPost} />
        );
      })}

      {/* "+N more replies" button for Level 1 */}
      {hasMore && !isExpandingAll && <ShowMoreReplies count={remaining} onClick={expandAll} isLast={!showQuickReply} />}

      {/* Quick reply at the end */}
      {showQuickReply && (
        <>
          <PostThreadSpacer />
          <QuickReply parentPostId={postId} />
        </>
      )}
    </Container>
  );
}
