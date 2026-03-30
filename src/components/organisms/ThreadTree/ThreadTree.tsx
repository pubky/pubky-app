'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';

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
  const { navigateToPost } = Hooks.usePostNavigation();
  const { replyIds, hasMore, totalCount, isExpandingAll, expandAll } = Hooks.useThreadReplies(postId);

  if (replyIds.length === 0 && !hasMore) {
    // No replies -- only show quick reply if enabled
    return showQuickReply ? (
      <Atoms.Container overrideDefaults>
        <Atoms.PostThreadSpacer />
        <Organisms.QuickReply parentPostId={postId} />
      </Atoms.Container>
    ) : null;
  }

  const remaining = Math.max(0, totalCount - replyIds.length);

  return (
    <Atoms.Container overrideDefaults>
      {/* Level 1 replies */}
      {replyIds.map((replyId, index) => {
        const isLastReply = index === replyIds.length - 1 && !hasMore && !showQuickReply;

        return (
          <Organisms.ReplyWithNested
            key={replyId}
            replyId={replyId}
            isLastReply={isLastReply}
            onPostClick={navigateToPost}
          />
        );
      })}

      {/* "+N more replies" button for Level 1 */}
      {hasMore && !isExpandingAll && (
        <Molecules.ShowMoreReplies count={remaining} onClick={expandAll} isLast={!showQuickReply} />
      )}

      {/* Quick reply at the end */}
      {showQuickReply && (
        <>
          <Atoms.PostThreadSpacer />
          <Organisms.QuickReply parentPostId={postId} />
        </>
      )}
    </Atoms.Container>
  );
}
