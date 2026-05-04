'use client';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

import { TAGS_PER_PAGE } from '@/hooks/usePostTags/usePostTags.constants';
import type { PostTagsPanelProps } from './PostTagsPanel.types';
import { cn } from '@/libs/utils/utils';

type PostTagsPanelSkeletonProps = Omit<PostTagsPanelProps, 'postId'>;

export function PostTagsPanelSkeleton({ widthMode = 'fit', className }: PostTagsPanelSkeletonProps) {
  return (
    <Container data-cy="post-tags-panel" data-testid="post-tags-panel-skeleton" className={cn('gap-2', className)}>
      <Container
        overrideDefaults
        className={cn('flex flex-col gap-2', widthMode === 'fit' ? 'w-fit max-w-full' : 'w-full')}
      >
        {/* TagInput area */}
        <Skeleton className="h-8 w-full rounded-md" />

        {/* Scrollable list of tag rows */}
        <Container overrideDefaults className="max-h-80 overflow-x-hidden overflow-y-auto pr-1">
          {Array.from({ length: TAGS_PER_PAGE }).map((_, index) => (
            <Container
              key={`post-tags-panel-skeleton-row-${index}`}
              overrideDefaults
              className="flex items-center gap-2 py-1"
            >
              <Skeleton className="h-8 w-20 shrink-0 rounded-md" />
              <Skeleton className="size-8 shrink-0 rounded" />
              <Container overrideDefaults className="flex items-center gap-0">
                <Skeleton className="-mr-2 size-8 shrink-0 rounded-full" />
                <Skeleton className="-mr-2 size-8 shrink-0 rounded-full" />
                <Skeleton className="size-8 shrink-0 rounded-full" />
              </Container>
            </Container>
          ))}
        </Container>

        {/* See All button */}
        <Skeleton className="h-8 w-full rounded-md" />
      </Container>
    </Container>
  );
}
