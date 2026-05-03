'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useLayoutReset } from '@/hooks/useLayoutReset/useLayoutReset';
import { cn } from '@/libs/utils/utils';
import { HotMobileMenu } from '@/molecules/HotMobileMenu/HotMobileMenu';
import { HotSection } from '@/molecules/HotMobileMenu/HotMobileMenu.types';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { HotFeedRightDrawer, HotFeedRightSidebar } from '@/organisms/FeedRightSidebar/FeedRightSidebar';
import { HotActiveUsers } from '@/organisms/HotActiveUsers/HotActiveUsers';
import { HotFeedDrawer, HotFeedSidebar } from '@/organisms/HotFeedFilters/HotFeedFilters';
import { HotTagsCardsSection } from '@/organisms/HotTagsCardsSection/HotTagsCardsSection';
import { HotTagsOverview } from '@/organisms/HotTagsOverview/HotTagsOverview';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

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
 *
 * On mobile (< lg), a tab navigation bar allows toggling between
 * Tags, Users, and Posts sections. Sections are hidden via CSS rather
 * than unmounted to preserve state and avoid refetching on tab switch.
 * On desktop, all sections are always visible.
 */
export function Hot() {
  const t = useTranslations('hot');
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState<HotSection>(HotSection.TAGS);
  useLayoutReset();

  const hideTags = isMobile && activeSection !== HotSection.TAGS;
  const hideUsers = isMobile && activeSection !== HotSection.USERS;
  const hidePosts = isMobile && activeSection !== HotSection.POSTS;

  return (
    <ContentLayout
      showRightMobileButton={false}
      hasGradientBackground={false}
      leftSidebarContent={<HotFeedSidebar />}
      rightSidebarContent={<HotFeedRightSidebar />}
      leftDrawerContent={<HotFeedDrawer />}
      rightDrawerContent={<HotFeedRightDrawer />}
      className="pb-24 lg:pb-12"
    >
      {/* Mobile section navigation - visible only on mobile (< lg) */}
      <HotMobileMenu activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* Hot Cards - hidden via CSS when another tab is active on mobile */}
      <HotTagsCardsSection className={cn(hideTags && 'hidden')} />

      {/* Tags Overview - hidden via CSS when another tab is active on mobile */}
      <HotTagsOverview className={cn(hideTags && 'hidden')} />

      {/* Active Users - hidden via CSS when another tab is active on mobile */}
      <HotActiveUsers className={cn(hideUsers && 'hidden')} />

      {/* Trending Posts - hidden via CSS when another tab is active on mobile */}
      <Container overrideDefaults className={cn('flex flex-col gap-2', hidePosts && 'hidden')}>
        <Heading level={5} size="lg" className="font-light text-muted-foreground">
          {t('trendingPosts')}
        </Heading>
        <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOT} />
      </Container>
    </ContentLayout>
  );
}
