'use client';

import { useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { Container } from '@/atoms/Container/Container';
import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { cn } from '@/libs/utils/utils';
import { ClickableTagsList } from '../ClickableTagsList/ClickableTagsList';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';

interface PostInlineTagsActionsProps {
  postId: string;
  savePostId?: string;
  onReplyClick: () => void;
  onRepostClick: () => void;
  className?: string;
  actionsClassName?: string;
}

export function PostInlineTagsActions({
  postId,
  savePostId = postId,
  onReplyClick,
  onRepostClick,
  className,
  actionsClassName,
}: PostInlineTagsActionsProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  // The tag button only reveals the tags. On mobile it must not focus the input and pop the soft
  // keyboard: the `[+]` add control owns autofocus.
  const isMobile = useIsMobile();

  return (
    <Container
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'flex-col items-start gap-3 md:flex-row md:justify-between md:gap-4',
        // Grid-scoped (decision D4): inside a narrow grid cell keep tags + actions
        // stacked. `!` beats the still-active viewport `md:` row classes; inert off-grid.
        '@max-xl/grid:mt-auto @max-xl/grid:flex-col! @max-xl/grid:items-start! @max-xl/grid:gap-3!',
        tagsExpanded ? 'md:items-end' : 'md:items-start',
        className,
      )}
    >
      {tagsExpanded ? (
        <PostTagsPanel
          postId={postId}
          widthMode="fit"
          autoFocusInput={!isMobile}
          enableLoadingSkeleton={false}
          className="flex-1"
        />
      ) : (
        <ClickableTagsList
          taggedId={postId}
          taggedKind={TagKind.POST}
          maxTagLength={POST_TAGS_MAX_LENGTH}
          maxTotalChars={POST_TAGS_MAX_TOTAL_CHARS}
          showCount={true}
          showInput={false}
          showAddButton={true}
          addMode={true}
        />
      )}
      <PostActionsBar
        postId={postId}
        savePostId={savePostId}
        onTagClick={() => setTagsExpanded((prev) => !prev)}
        onReplyClick={onReplyClick}
        onRepostClick={onRepostClick}
        className={actionsClassName}
      />
    </Container>
  );
}
