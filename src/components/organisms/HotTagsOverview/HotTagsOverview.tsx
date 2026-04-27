'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import { APP_ROUTES } from '@/app/routes';
import { HOT_TAGS_FEATURED_COUNT } from '@/config';
import type { HotTagsOverviewProps } from './HotTagsOverview.types';
import { DEFAULT_TAGS_LIMIT } from './HotTagsOverview.constants';
import { HotTagsOverviewSkeleton } from './HotTagsOverview.skeleton';
import { cn } from '@/libs/utils/utils';

/**
 * HotTagsOverview
 *
 * Organism that displays a grid of trending tags (starting from #4).
 * Skips the first 3 tags which are shown as featured cards.
 * Fetches hot tags based on reach and timeframe filters from the hot store.
 */
export function HotTagsOverview({ limit = DEFAULT_TAGS_LIMIT, className }: HotTagsOverviewProps) {
  const router = useRouter();
  const { reach, timeframe } = Core.useHotStore();

  // Fetch hot tags using the hook
  const { rawTags, isLoading, error } = Hooks.useHotTags({
    reach: reach === 'all' ? undefined : (reach as Core.UserStreamReach),
    timeframe,
    limit,
  });

  // Skip the featured tags (already shown in HotTagsCardsSection)
  const tags = useMemo(() => rawTags.slice(HOT_TAGS_FEATURED_COUNT), [rawTags]);

  const handleTagClick = (tagName: string) => {
    router.push(`${APP_ROUTES.SEARCH}?tags=${encodeURIComponent(tagName)}`);
  };

  // Don't render on error or empty results (tags after the featured cards)
  if (error || (!isLoading && tags.length === 0)) {
    return null;
  }

  return (
    <Atoms.Container
      overrideDefaults
      className={cn('flex w-full flex-col gap-2', className)}
      data-testid="hot-tags-overview"
    >
      {isLoading ? (
        <HotTagsOverviewSkeleton />
      ) : (
        <Atoms.Container overrideDefaults className="flex flex-wrap content-start gap-2">
          {tags.map((tag) => (
            <Atoms.Tag key={tag.label} name={tag.label} count={tag.tagged_count} onClick={handleTagClick} />
          ))}
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
