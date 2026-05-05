'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Tag } from '@/atoms/Tag/Tag';
import { HOT_TAGS_FEATURED_COUNT } from '@/config/tags';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { cn } from '@/libs/utils/utils';
import type { UserStreamReach } from '@/services/nexus/nexus.types';
import { useHotStore } from '@/stores/hot/hot.store';
import { DEFAULT_TAGS_LIMIT } from './HotTagsOverview.constants';
import { HotTagsOverviewSkeleton } from './HotTagsOverview.skeleton';
import type { HotTagsOverviewProps } from './HotTagsOverview.types';

/**
 * HotTagsOverview
 *
 * Organism that displays a grid of trending tags (starting from #4).
 * Skips the first 3 tags which are shown as featured cards.
 * Fetches hot tags based on reach and timeframe filters from the hot store.
 */
export function HotTagsOverview({ limit = DEFAULT_TAGS_LIMIT, className }: HotTagsOverviewProps) {
  const router = useRouter();
  const { reach, timeframe } = useHotStore();

  // Fetch hot tags using the hook
  const { rawTags, isLoading, error } = useHotTags({
    reach: reach === 'all' ? undefined : (reach as UserStreamReach),
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
    <Container overrideDefaults className={cn('flex w-full flex-col gap-2', className)} data-testid="hot-tags-overview">
      {isLoading ? (
        <HotTagsOverviewSkeleton />
      ) : (
        <Container overrideDefaults className="flex flex-wrap content-start gap-2">
          {tags.map((tag) => (
            <Tag key={tag.label} name={tag.label} count={tag.tagged_count} onClick={handleTagClick} />
          ))}
        </Container>
      )}
    </Container>
  );
}
