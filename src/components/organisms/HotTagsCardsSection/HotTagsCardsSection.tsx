'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { HOT_TAGS_FEATURED_COUNT } from '@/config/tags';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { cn } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { HotTagCard } from '@/molecules/HotTagCard/HotTagCard';
import type { UserStreamReach } from '@/services/nexus/nexus.types';
import { useHotStore } from '@/stores/hot/hot.store';
import { MAX_AVATARS_DEFAULT, MAX_AVATARS_MOBILE, MAX_AVATARS_XL } from './HotTagsCardsSection.constants';
import { HotTagsCardsSectionSkeleton } from './HotTagsCardsSection.skeleton';
import type { HotTagsCardsSectionProps } from './HotTagsCardsSection.types';

/**
 * HotTagsCardsSection
 *
 * Organism that displays the top 3 trending tags as featured cards.
 * Fetches hot tags based on reach and timeframe filters from the hot store.
 */
export function HotTagsCardsSection({ className }: HotTagsCardsSectionProps) {
  const router = useRouter();
  const { reach, timeframe } = useHotStore();
  const { isMuted } = useMutedUsers();

  // Fetch hot tags using the hook (no limit - get all from endpoint)
  const { rawTags, isLoading, error } = useHotTags({
    reach: reach === 'all' ? undefined : (reach as UserStreamReach),
    timeframe,
  });

  // Track the timeframe that corresponds to the currently loaded data.
  // This prevents showing a new timeframe label on stale cards during the
  // render gap between a store update and the fetch completing.
  const [dataTimeframe, setDataTimeframe] = useState(timeframe);

  useEffect(() => {
    if (!isLoading) {
      setDataTimeframe(timeframe);
    }
  }, [isLoading, timeframe]);

  const isEffectivelyLoading = isLoading || timeframe !== dataTimeframe;

  // Display only the top tags as featured cards
  const featuredTags = useMemo(() => rawTags.slice(0, HOT_TAGS_FEATURED_COUNT), [rawTags]);

  // Responsive avatar count based on screen size
  const isMobile = useIsMobile({ breakpoint: 'sm' }); // < 640px
  const isBelowXL = useIsMobile({ breakpoint: 'xl' }); // < 1280px

  const maxAvatars = isMobile ? MAX_AVATARS_MOBILE : isBelowXL ? MAX_AVATARS_DEFAULT : MAX_AVATARS_XL;

  // Collect unique tagger IDs for featured tags, excluding muted profiles (Hot page UX).
  const allTaggerIds = useMemo(() => {
    const ids = new Set<Pubky>();
    for (const tag of featuredTags) {
      for (const taggerId of tag.taggers_id) {
        if (!isMuted(taggerId)) {
          ids.add(taggerId);
        }
      }
    }
    return Array.from(ids);
  }, [featuredTags, isMuted]);

  // Get user avatars for all taggers
  const { getUsersWithAvatars } = useBulkUserAvatars(allTaggerIds);

  const handleTagClick = (tagName: string) => {
    router.push(`${APP_ROUTES.SEARCH}?tags=${encodeURIComponent(tagName)}`);
  };

  if (error) {
    return (
      <Container overrideDefaults className={cn('flex w-full flex-col gap-2', className)}>
        <Heading level={5} size="lg" className="font-light text-muted-foreground">
          {'Hot tags'}
        </Heading>
        <Typography className="text-destructive">{'Failed to load tags'}</Typography>
      </Container>
    );
  }

  if (isEffectivelyLoading) {
    return (
      <Container overrideDefaults className={cn('flex w-full flex-col gap-2', className)}>
        <Heading level={5} size="lg" className="font-light text-muted-foreground">
          {'Hot tags'}
        </Heading>
        <HotTagsCardsSectionSkeleton maxAvatars={maxAvatars} />
      </Container>
    );
  }

  return (
    <Container
      overrideDefaults
      className={cn('flex w-full flex-col gap-2', className)}
      data-testid="hot-tags-cards-section"
    >
      <Heading level={5} size="lg" className="font-light text-muted-foreground">
        {'Hot tags'}
      </Heading>
      {featuredTags.length === 0 ? (
        <Typography className="font-light text-muted-foreground">{'No tags to show'}</Typography>
      ) : (
        <Container overrideDefaults className="flex flex-col gap-3 sm:flex-row">
          {featuredTags.map((tag, index) => (
            <HotTagCard
              key={tag.label}
              rank={index + 1}
              tagName={tag.label}
              postCount={tag.tagged_count}
              timeframe={dataTimeframe}
              taggers={getUsersWithAvatars(tag.taggers_id.filter((id) => !isMuted(id)))}
              maxAvatars={maxAvatars}
              onClick={handleTagClick}
            />
          ))}
        </Container>
      )}
    </Container>
  );
}
