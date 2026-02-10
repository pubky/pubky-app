'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import type { ReplyWithNestedProps } from './ReplyWithNested.types';

/**
 * ReplyWithNested Organism
 *
 * Displays a Level 1 reply post with its Level 2 nested replies (if any).
 * Reads `allLevel2Expanded` from ThreadTreeContext to control visibility.
 *
 * Shows up to maxNestedReplies sub-replies underneath the main reply.
 * When more exist, a "+N more replies" button expands them inline.
 *
 * When the Level 1 reply is not the last sibling, a continuation line
 * is drawn on the far left alongside the Level 2 section.
 */
export function ReplyWithNested({
  replyId,
  isLastReply = false,
  onPostClick,
  maxNestedReplies = Hooks.DEFAULT_MAX_NESTED,
  depth = 0,
  maxDepth = Hooks.DEFAULT_MAX_DEPTH,
  showExpandToggle = false,
}: ReplyWithNestedProps) {
  const { allLevel2Expanded } = Hooks.useThreadTreeContext();

  const { nestedReplyIds, hasMoreReplies, hasNestedReplies, replyCount, expandAll } = Hooks.useNestedReplies(replyId, {
    maxNestedReplies,
    depth,
    maxDepth,
  });

  // Level 2 section is visible when the global toggle is expanded AND there are nested replies
  const showNestedSection = allLevel2Expanded && hasNestedReplies;

  // The main reply connector: if nested section is visible, it's not the "last" visually
  // because the Level 2 section continues below it.
  const mainReplyIsLast = isLastReply && !showNestedSection;

  return (
    <Atoms.Container overrideDefaults>
      {/* Main Level 1 reply */}
      <Atoms.PostThreadSpacer />
      <Atoms.Container overrideDefaults className={showExpandToggle ? 'relative' : undefined}>
        <Organisms.PostMain
          postId={replyId}
          isReply={true}
          onClick={() => onPostClick(replyId)}
          isLastReply={mainReplyIsLast}
        />
        {/* Global expand/collapse toggle — centered on the connector line, near the bottom of the card */}
        {showExpandToggle && (
          <Atoms.Container overrideDefaults className="absolute bottom-10 left-0 z-10 -translate-x-1/2">
            <Molecules.ThreadExpandToggle />
          </Atoms.Container>
        )}
      </Atoms.Container>

      {/* Level 2 nested replies - only visible when global toggle is expanded */}
      {showNestedSection && (
        <Atoms.Container overrideDefaults className="flex">
          {/* Level 1 continuation line (only when not the last Level 1 reply) */}
          {!isLastReply && <Atoms.Container overrideDefaults className="w-3 shrink-0 border-l border-border" />}

          {/* Level 2 replies indented */}
          <Atoms.Container overrideDefaults className={isLastReply ? 'ml-6 flex-1' : 'ml-3 flex-1'}>
            {nestedReplyIds.map((nestedId, index) => {
              const isLastNested = index === nestedReplyIds.length - 1 && !hasMoreReplies;
              return (
                <Atoms.Container key={`nested_${nestedId}`} overrideDefaults>
                  <Atoms.PostThreadSpacer />
                  <Organisms.PostMain
                    postId={nestedId}
                    isReply={true}
                    onClick={() => onPostClick(nestedId)}
                    isLastReply={isLastNested}
                  />
                </Atoms.Container>
              );
            })}

            {/* Show "+N more replies" if there are more nested replies */}
            {hasMoreReplies && (
              <Molecules.ShowMoreReplies count={replyCount - nestedReplyIds.length} onClick={expandAll} isLast={true} />
            )}
          </Atoms.Container>
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
