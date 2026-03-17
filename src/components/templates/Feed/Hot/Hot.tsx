'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import { TIMELINE_FEED_VARIANT } from '@/config';

/**
 * Hot Template
 *
 * Template for the Hot feed page.
 * Uses the hot store for reach and timeframe filters.
 *
 * Sections:
 * 1. Hot Cards - Top 3 featured tags
 * 2. Tags Overview - Grid of 50 colorful tags
 * 3. Active Users - Influential users list
 * 4. Trending Posts - Timeline of popular posts
 */
export function Hot() {
  const t = useTranslations('hot');
  Hooks.useLayoutReset();

  return (
    <Organisms.ContentLayout
      showRightMobileButton={false}
      leftSidebarContent={<Organisms.HotFeedSidebar />}
      rightSidebarContent={<Organisms.HotFeedRightSidebar />}
      leftDrawerContent={<Organisms.HotFeedDrawer />}
      rightDrawerContent={<Organisms.HotFeedRightDrawer />}
    >
      {/* Hot Cards - Top 3 featured tags */}
      <Organisms.HotTagsCardsSection />

      {/* Tags Overview - Grid of 50 colorful tags */}
      <Organisms.HotTagsOverview />

      {/* Active Users - Influential users list */}
      <Organisms.HotActiveUsers />

      {/* Trending Posts - Timeline of popular posts */}
      <Atoms.Container overrideDefaults className="flex flex-col gap-2">
        <Atoms.Heading level={5} size="lg" className="font-light text-muted-foreground">
          {t('trendingPosts')}
        </Atoms.Heading>
        <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.HOT} />
      </Atoms.Container>
    </Organisms.ContentLayout>
  );
}
