'use client';

import { type MouseEvent, type ReactNode, useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { Container } from '@/atoms/Container/Container';
import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { cn } from '@/libs/utils/utils';
import { ClickableTagsList } from '@/organisms/ClickableTagsList/ClickableTagsList';
import { PostTagsPanel } from '@/organisms/PostTagsPanel/PostTagsPanel';
import { PostTagToggleButton } from './PostTagToggleButton';

interface PostTagsExpandableRowProps {
  postId: string;
  children?: ReactNode;
  className?: string;
  tagsClassName?: string;
  actionsClassName?: string;
  preventDefaultOnClick?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  showTagToggle?: boolean;
}

export function PostTagsExpandableRow({
  postId,
  children,
  className,
  tagsClassName,
  actionsClassName,
  preventDefaultOnClick = false,
  expanded,
  onExpandedChange,
  showTagToggle = true,
}: PostTagsExpandableRowProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const tagsExpanded = expanded ?? internalExpanded;
  const hasExternalExpandedState = expanded !== undefined;
  const shouldRenderActions = showTagToggle || Boolean(children);

  const suppressParentInteraction = (event: MouseEvent) => {
    if (preventDefaultOnClick) event.preventDefault();
    event.stopPropagation();
  };

  const handleTagToggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (preventDefaultOnClick) {
      event.preventDefault();
      event.stopPropagation();
    }
    const nextExpanded = !tagsExpanded;
    onExpandedChange?.(nextExpanded);
    if (!hasExternalExpandedState) setInternalExpanded(nextExpanded);
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

      {shouldRenderActions && (
        <Container
          overrideDefaults
          data-cy="post-tags-expandable-row-actions"
          onClick={suppressParentInteraction}
          onAuxClick={suppressParentInteraction}
          className={cn('flex shrink-0 items-center gap-2 self-end', actionsClassName)}
        >
          {showTagToggle && <PostTagToggleButton postId={postId} expanded={tagsExpanded} onToggle={handleTagToggle} />}
          {children}
        </Container>
      )}
    </Container>
  );
}
