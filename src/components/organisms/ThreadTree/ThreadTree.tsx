'use client';

import { Container } from '@/atoms/Container/Container';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { PostThreadSpacer } from '@/atoms/PostThreadSpacer/PostThreadSpacer';
import { usePostListKeyboard } from '@/hooks/usePostListKeyboard/usePostListKeyboard';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useThreadReplies } from '@/hooks/useThreadReplies/useThreadReplies';
import type { UseThreadRepliesResult } from '@/hooks/useThreadReplies/useThreadReplies.types';
import { ShowMoreReplies } from '@/molecules/ShowMoreReplies/ShowMoreReplies';
import { QuickReply } from '../QuickReply/QuickReply';
import type { QuickReplyTarget } from '../QuickReply/QuickReply.types';
import { ReplyWithNested } from '../ReplyWithNested/ReplyWithNested';

interface ThreadTreeProps {
  /** The composite post ID of the parent (Level 0) post */
  postId: string;
  /** Whether to show the QuickReply input before the replies */
  showQuickReply?: boolean;
}

/**
 * ThreadTree Organism
 *
 * Renders a nested tree of replies for a post (up to 3 levels deep).
 * Each reply independently manages its own expand/collapse state.
 *
 * Shared between the feed timeline and the single post page.
 *
 * The tree keeps one shape whether or not replies exist. The composer below holds the
 * draft in its own state, so rendering it from a second, structurally different branch
 * remounts it. The first reply of a thread — the optimistic local write, and its
 * rollback when the homeserver write fails — flips the reply list, which used to
 * remount the composer and discard what the user had typed.
 */
export function ThreadTree({ postId, showQuickReply = true }: ThreadTreeProps) {
  const replies = useThreadReplies(postId);
  return <ThreadTreeView replies={replies} quickReply={showQuickReply ? { parentPostId: postId } : null} />;
}

interface ThreadTreeViewProps {
  /** The Level 1 replies to show, oldest first, with the "+N more replies" state. */
  replies: Pick<UseThreadRepliesResult, 'replyIds' | 'hasMore' | 'totalCount' | 'isExpandingAll' | 'expandAll'>;
  /** What the QuickReply above the replies answers; `null` shows no composer. */
  quickReply: QuickReplyTarget | null;
  /** Called with the new reply's id once the QuickReply wrote it. */
  onReplySubmitted?: (replyId: string) => void;
}

/**
 * The thread's markup for any list of replies: the post page's (`ThreadTree`) and an external
 * resource page's, whose replies are posts whose `parent` is the resource's URI.
 */
export function ThreadTreeView({ replies, quickReply, onReplySubmitted }: ThreadTreeViewProps) {
  const { replyIds, hasMore, totalCount, isExpandingAll, expandAll } = replies;
  const showQuickReply = quickReply !== null;
  const { handlePostKeyDown } = usePostNavigation();
  const { setCardRef, onListKeyDown } = usePostListKeyboard({
    // Include ShowMoreReplies (data-post-list-card="true") in j/k navigation.
    // The containment filter in the hook excludes nested ReplyWithNested depth>0
    // cards (which share the same attribute) from the list automatically.
    cardSelector: '[data-post-list-card="true"]',
  });

  const hasReplies = replyIds.length > 0 || hasMore;

  // No replies and no composer to offer: nothing to render
  if (!showQuickReply && !hasReplies) return null;

  const remaining = Math.max(0, totalCount - replyIds.length);
  const ariaSetSize = totalCount > 0 ? totalCount : replyIds.length;

  return (
    <Container
      overrideDefaults
      // The feed role and its j/k navigation apply only once reply cards exist
      role={hasReplies ? 'feed' : undefined}
      onKeyDown={hasReplies ? onListKeyDown : undefined}
    >
      {/* Quick reply directly below the parent post */}
      {quickReply && (
        <>
          <PostThreadSpacer />
          <QuickReply
            {...quickReply}
            onReplySubmitted={onReplySubmitted}
            connectorVariant={hasReplies ? POST_THREAD_CONNECTOR_VARIANTS.REGULAR : POST_THREAD_CONNECTOR_VARIANTS.LAST}
          />
        </>
      )}

      {/* Level 1 replies */}
      {replyIds.map((replyId, index) => {
        const isLastReply = index === replyIds.length - 1 && (!hasMore || isExpandingAll);

        return (
          <Container
            key={replyId}
            ref={setCardRef(index)}
            overrideDefaults
            data-post-list-card="true"
            role="article"
            aria-posinset={index + 1}
            aria-setsize={ariaSetSize}
            tabIndex={0}
            onKeyDown={(e) => handlePostKeyDown(replyId, e)}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ReplyWithNested replyId={replyId} isLastReply={isLastReply} />
          </Container>
        );
      })}

      {/* "+N more replies" button for Level 1 */}
      {hasMore && !isExpandingAll && <ShowMoreReplies count={remaining} onClick={expandAll} isLast />}
    </Container>
  );
}
