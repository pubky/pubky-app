'use client';

import { useEffect, useState } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import { AUTO_COLLAPSE_THRESHOLD } from '@/hooks/useNestedReplies/useNestedReplies.constants';
import type { ReplyWithNestedProps } from './ReplyWithNested.types';

/**
 * ReplyWithNested Organism
 *
 * Displays a reply post with its nested sub-replies (recursive).
 * Each instance manages its own expand/collapse state:
 * - Replies with ≤3 sub-replies start expanded
 * - Replies with 4+ sub-replies start collapsed
 *
 * Recurses up to maxDepth levels (default 3).
 */
export function ReplyWithNested({
  replyId,
  isLastReply = false,
  onPostClick,
  depth = 0,
  maxDepth = Hooks.DEFAULT_MAX_DEPTH,
}: ReplyWithNestedProps) {
  const { nestedReplyIds, hasMoreReplies, hasNestedReplies, replyCount, isExpandingAll, expandAll } =
    Hooks.useNestedReplies(replyId, { depth, maxDepth });

  // Local expand/collapse state — set once when replies are first available.
  // Until initialized, we skip rendering the nested section to avoid a flash
  // (starting collapsed then immediately animating to expanded).
  // Use replyCount (from postCounts) when available, otherwise fall back to the
  // number of locally cached reply IDs — postCounts can lag behind the cache.
  const [initialized, setInitialized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const effectiveReplyCount = replyCount > 0 ? replyCount : nestedReplyIds.length;

  useEffect(() => {
    if (!initialized && effectiveReplyCount > 0) {
      setInitialized(true);
      setExpanded(effectiveReplyCount < AUTO_COLLAPSE_THRESHOLD);
    }
  }, [initialized, effectiveReplyCount]);

  const canShowToggle = hasNestedReplies && depth < maxDepth;

  return (
    <Atoms.Container overrideDefaults>
      {/* Main reply */}
      <Atoms.PostThreadSpacer />
      <Atoms.Container overrideDefaults className={canShowToggle ? 'relative' : undefined}>
        <Organisms.PostMain
          postId={replyId}
          isReply={true}
          onClick={() => onPostClick(replyId)}
          isLastReply={isLastReply}
        />
        {/* Toggle on the connector line, just above the rounded corner */}
        {canShowToggle && (
          <Atoms.Container overrideDefaults className="absolute bottom-[24px] left-0 z-10 -translate-x-1/2">
            <Molecules.ThreadExpandToggle expanded={expanded} onToggle={() => setExpanded((prev) => !prev)} />
          </Atoms.Container>
        )}
      </Atoms.Container>

      {/* Nested sub-replies — animated expand/collapse (skip until initial state is set) */}
      {hasNestedReplies && initialized && (
        <Atoms.Container
          overrideDefaults
          className={`grid transition-all duration-300 ease-in-out ${
            expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <Atoms.Container overrideDefaults className="overflow-hidden">
            <Atoms.Container overrideDefaults className="flex">
              {/* Continuation line (only when not the last sibling) */}
              {!isLastReply && <Atoms.Container overrideDefaults className="w-3 shrink-0 border-l border-border" />}

              {/* Indented sub-replies */}
              <Atoms.Container overrideDefaults className={isLastReply ? 'ml-6 flex-1' : 'ml-3 flex-1'}>
                {nestedReplyIds.map((nestedId, index) => {
                  const isLastNested = index === nestedReplyIds.length - 1 && !hasMoreReplies;
                  return (
                    <ReplyWithNested
                      key={nestedId}
                      replyId={nestedId}
                      isLastReply={isLastNested}
                      onPostClick={onPostClick}
                      depth={depth + 1}
                      maxDepth={maxDepth}
                    />
                  );
                })}

                {/* "+N more replies" if there are more nested replies */}
                {hasMoreReplies && !isExpandingAll && (
                  <Molecules.ShowMoreReplies
                    count={Math.max(0, replyCount - nestedReplyIds.length)}
                    onClick={expandAll}
                    isLast={true}
                  />
                )}
              </Atoms.Container>
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
