'use client';

import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Core from '@/core';
import { APP_ROUTES } from '@/app/routes';
import { HOT_TAGS_FEATURED_COUNT } from '@/config';
import { HotTagsCardsSectionSkeleton } from './HotTagsCardsSection.skeleton';
import type { HotTagsCardsSectionProps } from './HotTagsCardsSection.types';
import { MAX_AVATARS_MOBILE, MAX_AVATARS_DEFAULT, MAX_AVATARS_XL } from './HotTagsCardsSection.constants';
import { cn } from '@/libs/utils/utils';

/**
 * HotTagsCardsSection
 *
 * Organism that displays the top 3 trending tags as featured cards.
 * Fetches hot tags based on reach and timeframe filters from the hot store.
 */
export function HotTagsCardsSection({ className }: HotTagsCardsSectionProps) {
  const t = useTranslations('hot');
  const router = useRouter();
  const { reach, timeframe } = Core.useHotStore();

  // Fetch hot tags using the hook (no limit - get all from endpoint)
  const { rawTags, isLoading, error } = useHotTags({
    reach: reach === 'all' ? undefined : (reach as Core.UserStreamReach),
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

  // Collect all unique tagger IDs from featured tags only
  const allTaggerIds = useMemo(() => {
    const ids = new Set<Core.Pubky>();
    for (const tag of featuredTags) {
      for (const taggerId of tag.taggers_id) {
        ids.add(taggerId);
      }
    }
    return Array.from(ids);
  }, [featuredTags]);

  // Get user avatars for all taggers
  const { getUsersWithAvatars } = useBulkUserAvatars(allTaggerIds);

  const handleTagClick = (tagName: string) => {
    router.push(`${APP_ROUTES.SEARCH}?tags=${encodeURIComponent(tagName)}`);
  };

  if (error) {
    return (
      <Atoms.Container overrideDefaults className={cn('flex w-full flex-col gap-2', className)}>
        <Atoms.Heading level={5} size="lg" className="font-light text-muted-foreground">
          {t('hotTags')}
        </Atoms.Heading>
        <Atoms.Typography className="text-destructive">{t('failedToLoadTags')}</Atoms.Typography>
      </Atoms.Container>
    );
  }

  if (isEffectivelyLoading) {
    return (
      <Atoms.Container overrideDefaults className={cn('flex w-full flex-col gap-2', className)}>
        <Atoms.Heading level={5} size="lg" className="font-light text-muted-foreground">
          {t('hotTags')}
        </Atoms.Heading>
        <HotTagsCardsSectionSkeleton maxAvatars={maxAvatars} />
      </Atoms.Container>
    );
  }

  return (
    <Atoms.Container
      overrideDefaults
      className={cn('flex w-full flex-col gap-2', className)}
      data-testid="hot-tags-cards-section"
    >
      <Atoms.Heading level={5} size="lg" className="font-light text-muted-foreground">
        {t('hotTags')}
      </Atoms.Heading>
      {featuredTags.length === 0 ? (
        <Atoms.Typography className="font-light text-muted-foreground">{t('noTagsToShow')}</Atoms.Typography>
      ) : (
        <Atoms.Container overrideDefaults className="flex flex-col gap-3 sm:flex-row">
          {featuredTags.map((tag, index) => (
            <Molecules.HotTagCard
              key={tag.label}
              rank={index + 1}
              tagName={tag.label}
              postCount={tag.tagged_count}
              timeframe={dataTimeframe}
              taggers={getUsersWithAvatars(tag.taggers_id)}
              maxAvatars={maxAvatars}
              onClick={handleTagClick}
            />
          ))}
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
