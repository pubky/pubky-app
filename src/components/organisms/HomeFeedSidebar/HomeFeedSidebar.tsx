'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { FilterContent } from '@/molecules/Filters/FilterContent/FilterContent';
import { FilterLayout } from '@/molecules/Filters/FilterLayout/FilterLayout';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { FilterSort } from '@/molecules/Filters/FilterSort/FilterSort';
import { useHomeStore } from '@/stores/home/home.store';
import {
  resolveVisualFeedContent,
  VISUAL_DISABLED_CONTENT,
} from '../Timeline/Feed/TimelineFeed/TimelineFeedVisual.helpers';
import type { HomeFeedSidebarProps } from './HomeFeedSidebar.types';

/**
 * HomeFeedFilters
 *
 * Base component for Home feed filters - manages filter state via useHomeStore.
 * Used by sidebar (desktop) and drawer (tablet/mobile) variants.
 *
 * Order follows Figma design: Reach → Sort → Layout → Content
 * Gap between sections: 24px (gap-6)
 */
function HomeFeedFilters({
  hideReachFilter = false,
  hideLayoutFilter = false,
  allowVisualLayout = false,
  feedVariant = TIMELINE_FEED_VARIANT.HOME,
  variant = 'drawer',
}: HomeFeedSidebarProps) {
  const { layout, setLayout, reach, setReach, sort, setSort, content, setContent } = useHomeStore();
  const { isPhoneViewport, isVisualActive } = useFeedLayoutResolution(feedVariant);
  const resolvedContent = resolveVisualFeedContent({
    content,
    variant: feedVariant,
    isVisualActive,
  });

  const disabledContentTabs = isVisualActive ? VISUAL_DISABLED_CONTENT : [];
  const showVisualLayout = allowVisualLayout && !isPhoneViewport;

  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      {!hideReachFilter && <FilterReach selectedTab={reach} onTabChange={setReach} />}
      <FilterSort selectedTab={sort} onTabChange={setSort} />
      {variant === 'sidebar' ? (
        <Container overrideDefaults className="sticky top-[100px] flex w-full flex-col gap-6 self-start">
          {!hideLayoutFilter && (
            <FilterLayout selectedTab={layout} onTabChange={setLayout} showVisual={showVisualLayout} />
          )}
          <FilterContent selectedTab={resolvedContent} onTabChange={setContent} disabledTabs={disabledContentTabs} />
        </Container>
      ) : (
        <>
          {!hideLayoutFilter && (
            <FilterLayout selectedTab={layout} onTabChange={setLayout} showVisual={showVisualLayout} />
          )}
          <FilterContent selectedTab={resolvedContent} onTabChange={setContent} disabledTabs={disabledContentTabs} />
        </>
      )}
    </Container>
  );
}

/**
 * HomeFeedSidebar
 *
 * Left sidebar for Home feed (desktop) - manages filter state via useHomeStore.
 * Desktop version with sticky positioning.
 */
export function HomeFeedSidebar({
  hideReachFilter = false,
  allowVisualLayout = false,
  feedVariant = TIMELINE_FEED_VARIANT.HOME,
}: HomeFeedSidebarProps) {
  return (
    <HomeFeedFilters
      hideReachFilter={hideReachFilter}
      allowVisualLayout={allowVisualLayout}
      feedVariant={feedVariant}
      variant="sidebar"
    />
  );
}

/**
 * HomeFeedDrawer
 *
 * Left drawer for Home feed (tablet) - manages filter state via useHomeStore.
 */
export function HomeFeedDrawer({
  hideReachFilter = false,
  allowVisualLayout = false,
  feedVariant = TIMELINE_FEED_VARIANT.HOME,
}: HomeFeedSidebarProps) {
  return (
    <HomeFeedFilters
      hideReachFilter={hideReachFilter}
      allowVisualLayout={allowVisualLayout}
      feedVariant={feedVariant}
      variant="drawer"
    />
  );
}

/**
 * HomeFeedDrawerMobile
 *
 * Left drawer for Home feed (mobile) - manages filter state via useHomeStore.
 * Note: Mobile version doesn't show layout filter.
 */
export function HomeFeedDrawerMobile({
  hideReachFilter = false,
  allowVisualLayout = false,
  feedVariant = TIMELINE_FEED_VARIANT.HOME,
}: HomeFeedSidebarProps) {
  return (
    <HomeFeedFilters
      hideReachFilter={hideReachFilter}
      hideLayoutFilter
      allowVisualLayout={allowVisualLayout}
      feedVariant={feedVariant}
      variant="drawer"
    />
  );
}
