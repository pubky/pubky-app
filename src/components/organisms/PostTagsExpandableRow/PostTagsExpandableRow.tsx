'use client';

import { type MouseEvent, type ReactNode, useState } from 'react';
import { Tag } from 'lucide-react';
import { TagKind } from '@/application/tag/tag.types';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { cn } from '@/libs/utils/utils';
import { ClickableTagsList } from '@/organisms/ClickableTagsList/ClickableTagsList';
import { PostTagsPanel } from '@/organisms/PostTagsPanel/PostTagsPanel';

interface PostTagsExpandableRowProps {
  postId: string;
  children?: ReactNode;
  className?: string;
  tagsClassName?: string;
  actionsClassName?: string;
  preventDefaultOnClick?: boolean;
}

export function PostTagsExpandableRow({
  postId,
  children,
  className,
  tagsClassName,
  actionsClassName,
  preventDefaultOnClick = false,
}: PostTagsExpandableRowProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const { postCounts, isLoading: isCountsLoading } = usePostCounts(postId);
  const tagCount = postCounts?.unique_tags ?? 0;
  const isTagCountLoading = isCountsLoading;

  const suppressParentInteraction = (event: MouseEvent) => {
    if (preventDefaultOnClick) event.preventDefault();
    event.stopPropagation();
  };

  const handleTagToggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (preventDefaultOnClick) {
      event.preventDefault();
      event.stopPropagation();
    }
    setTagsExpanded((prev) => !prev);
  };

  return (
    <Container
      overrideDefaults
      data-cy="post-tags-expandable-row"
      className={cn(
        'flex w-full flex-wrap justify-between gap-3 sm:flex-nowrap',
        tagsExpanded ? 'items-end' : 'items-center',
        className,
      )}
    >
      <Container overrideDefaults className={cn('min-w-0 flex-1', tagsClassName)}>
        {tagsExpanded ? (
          <Container
            overrideDefaults
            data-cy="post-tags-expandable-panel"
            onClick={preventDefaultOnClick ? suppressParentInteraction : undefined}
            onAuxClick={preventDefaultOnClick ? suppressParentInteraction : undefined}
            className="w-fit max-w-full"
          >
            <PostTagsPanel postId={postId} widthMode="fit" autoFocusInput enableLoadingSkeleton={false} />
          </Container>
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
      </Container>

      <Container
        overrideDefaults
        data-cy="post-tags-expandable-row-actions"
        onClick={suppressParentInteraction}
        onAuxClick={suppressParentInteraction}
        className={cn('flex shrink-0 items-center gap-2 self-end', actionsClassName)}
      >
        {isTagCountLoading ? (
          <Skeleton data-cy="post-tag-btn-skeleton" className="h-8 w-12 rounded-full" />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTagToggle}
            aria-expanded={tagsExpanded}
            aria-label={`Tag post (${tagCount})`}
            data-cy="post-tag-btn"
            className="border-none shadow-xs"
          >
            <Tag />
            <Typography as="span" overrideDefaults className="text-xs leading-4 font-bold text-muted-foreground">
              {tagCount}
            </Typography>
          </Button>
        )}
        {children}
      </Container>
    </Container>
  );
}
