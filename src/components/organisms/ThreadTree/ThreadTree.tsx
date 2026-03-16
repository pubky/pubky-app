'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import { ThreadTreeProvider } from './ThreadTreeProvider';
import type { ThreadTreeProps } from './ThreadTree.types';

/**
 * ThreadTree Organism
 *
 * Renders a 3-level nested tree of replies for a post:
 * - Level 1: Direct replies (max 3 initially + show-more)
 * - Level 2: Replies to Level 1 replies (collapsed by default, controlled by global toggle)
 *
 * Shared between the feed timeline and the single post page.
 */
export function ThreadTree({ postId, showQuickReply = true }: ThreadTreeProps) {
  const { navigateToPost } = Hooks.usePostNavigation();
  const { replyIds, hasMore, totalCount, isExpandingAll, expandAll, hasAnyNestedReplies } =
    Hooks.useThreadReplies(postId);

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
    <ThreadTreeProvider>
      <Atoms.Container overrideDefaults>
        {/* Level 1 replies */}
        {replyIds.map((replyId, index) => {
          const isFirstReply = index === 0;
          const isLastReply = index === replyIds.length - 1 && !hasMore && !showQuickReply;

          return (
            <Organisms.ReplyWithNested
              key={replyId}
              replyId={replyId}
              isLastReply={isLastReply}
              onPostClick={navigateToPost}
              showExpandToggle={isFirstReply && hasAnyNestedReplies}
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
    </ThreadTreeProvider>
  );
}
