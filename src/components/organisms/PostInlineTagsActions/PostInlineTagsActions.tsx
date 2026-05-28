'use client';

import { useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { Container } from '@/atoms/Container/Container';
import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { cn } from '@/libs/utils/utils';
import { ClickableTagsList } from '../ClickableTagsList/ClickableTagsList';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';

interface PostInlineTagsActionsProps {
  postId: string;
  onReplyClick: () => void;
  onRepostClick: () => void;
  className?: string;
  actionsClassName?: string;
}

export function PostInlineTagsActions({
  postId,
  onReplyClick,
  onRepostClick,
  className,
  actionsClassName,
}: PostInlineTagsActionsProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);

  return (
    <Container
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'flex flex-col items-start gap-2 @md/post:flex-row @md/post:flex-wrap @md/post:items-center @md/post:justify-between @md/post:gap-x-2 @md/post:gap-y-4',
        tagsExpanded ? '@md/post:items-end' : '@md/post:items-start',
        className,
      )}
    >
      {tagsExpanded ? (
        <PostTagsPanel
          postId={postId}
          widthMode="fit"
          autoFocusInput
          enableLoadingSkeleton={false}
          className="min-w-0 flex-1"
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
          className="min-w-0 flex-1"
        />
      )}
      <PostActionsBar
        postId={postId}
        onTagClick={() => setTagsExpanded((prev) => !prev)}
        onReplyClick={onReplyClick}
        onRepostClick={onRepostClick}
        className={cn('w-full shrink-0 justify-start @md/post:w-auto @md/post:justify-end', actionsClassName)}
      />
    </Container>
  );
}
