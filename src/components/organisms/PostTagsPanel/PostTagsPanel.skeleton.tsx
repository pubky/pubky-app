'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import { TAGS_PER_PAGE } from '@/hooks/usePostTags/usePostTags.constants';
import type { PostTagsPanelProps } from './PostTagsPanel.types';

type PostTagsPanelSkeletonProps = Omit<PostTagsPanelProps, 'postId'>;

export function PostTagsPanelSkeleton({ widthMode = 'fit', className }: PostTagsPanelSkeletonProps) {
  return (
    <Atoms.Container
      data-cy="post-tags-panel"
      data-testid="post-tags-panel-skeleton"
      className={Libs.cn('gap-2', className)}
    >
      <Atoms.Container
        overrideDefaults
        className={Libs.cn('flex flex-col gap-2', widthMode === 'fit' ? 'w-fit max-w-full' : 'w-full')}
      >
        {/* TagInput area */}
        <Atoms.Skeleton className="h-10 w-full rounded-md" />

        {/* Scrollable list of tag rows */}
        <Atoms.Container overrideDefaults className="max-h-80 overflow-x-hidden overflow-y-auto pr-1">
          {Array.from({ length: TAGS_PER_PAGE }).map((_, index) => (
            <Atoms.Container
              key={`post-tags-panel-skeleton-row-${index}`}
              overrideDefaults
              className="flex items-center gap-2 py-1"
            >
              <Atoms.Skeleton className="h-8 w-20 shrink-0 rounded-md" />
              <Atoms.Skeleton className="size-8 shrink-0 rounded" />
              <Atoms.Container overrideDefaults className="flex items-center gap-0">
                <Atoms.Skeleton className="-mr-2 size-8 shrink-0 rounded-full" />
                <Atoms.Skeleton className="-mr-2 size-8 shrink-0 rounded-full" />
                <Atoms.Skeleton className="size-8 shrink-0 rounded-full" />
              </Atoms.Container>
            </Atoms.Container>
          ))}
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );
}
