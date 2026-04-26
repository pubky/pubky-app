'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import { TIMELINE_FEED_VARIANT } from '@/config';
import { HotSection } from '@/molecules/HotMobileMenu/HotMobileMenu.types';
import { cn } from '@/libs/utils/utils';

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
  const isMobile = Hooks.useIsMobile();
  const [activeSection, setActiveSection] = useState<HotSection>(HotSection.TAGS);
  Hooks.useLayoutReset();

  const hideTags = isMobile && activeSection !== HotSection.TAGS;
  const hideUsers = isMobile && activeSection !== HotSection.USERS;
  const hidePosts = isMobile && activeSection !== HotSection.POSTS;

  return (
    <Organisms.ContentLayout
      showRightMobileButton={false}
      hasGradientBackground={false}
      leftSidebarContent={<Organisms.HotFeedSidebar />}
      rightSidebarContent={<Organisms.HotFeedRightSidebar />}
      leftDrawerContent={<Organisms.HotFeedDrawer />}
      rightDrawerContent={<Organisms.HotFeedRightDrawer />}
      className="pb-24 lg:pb-12"
    >
      {/* Mobile section navigation - visible only on mobile (< lg) */}
      <Molecules.HotMobileMenu activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* Hot Cards - hidden via CSS when another tab is active on mobile */}
      <Organisms.HotTagsCardsSection className={cn(hideTags && 'hidden')} />

      {/* Tags Overview - hidden via CSS when another tab is active on mobile */}
      <Organisms.HotTagsOverview className={cn(hideTags && 'hidden')} />

      {/* Active Users - hidden via CSS when another tab is active on mobile */}
      <Organisms.HotActiveUsers className={cn(hideUsers && 'hidden')} />

      {/* Trending Posts - hidden via CSS when another tab is active on mobile */}
      <Atoms.Container overrideDefaults className={cn('flex flex-col gap-2', hidePosts && 'hidden')}>
        <Atoms.Heading level={5} size="lg" className="font-light text-muted-foreground">
          {t('trendingPosts')}
        </Atoms.Heading>
        <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.HOT} />
      </Atoms.Container>
    </Organisms.ContentLayout>
  );
}
