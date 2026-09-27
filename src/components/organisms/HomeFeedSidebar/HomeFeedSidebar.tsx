'use client';

import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT, type TimelineFeedVariant } from '@/config/feed';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useSelectedReachFilter } from '@/hooks/useSelectedReachFilter/useSelectedReachFilter';
import { FilterContent } from '@/molecules/Filters/FilterContent/FilterContent';
import { FilterLayout } from '@/molecules/Filters/FilterLayout/FilterLayout';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { FilterSort } from '@/molecules/Filters/FilterSort/FilterSort';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { type ReachFilterValue } from '@/stores/home/home.types';
import { type ContentType, REACH, type ReachType, type SortType } from '@/stores/home/home.types';
import { getHomeStreamIdFromFilters } from '@/stores/home/home.utils';
import {
  resolveVisualFeedContent,
  VISUAL_DISABLED_CONTENT,
} from '../Timeline/Feed/TimelineFeed/TimelineFeedVisual.helpers';

interface HomeFeedSidebarProps {
  hideReachFilter?: boolean;
  hideSortFilter?: boolean;
  hideLayoutFilter?: boolean;
  allowVisualLayout?: boolean;
  feedVariant?: TimelineFeedVariant;
  variant?: 'sidebar' | 'drawer';
}

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
  hideSortFilter = false,
  hideLayoutFilter = false,
  allowVisualLayout = false,
  feedVariant = TIMELINE_FEED_VARIANT.HOME,
  variant = 'drawer',
}: HomeFeedSidebarProps) {
  const {
    layout,
    setLayout,
    setReach,
    taggedAsActive,
    setTaggedAsActive,
    sort,
    setSort,
    content,
    setContent,
    profileTags,
    addProfileTag,
    removeProfileTag,
  } = useHomeStore();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { requireAuth } = useRequireAuth();
  const isAuthenticated = Boolean(currentUserPubky);
  const selectedReach = useSelectedReachFilter();
  const effectiveProfileTags = isAuthenticated ? profileTags : [];
  const { isPhoneViewport, isVisualActive } = useFeedLayoutResolution(feedVariant);

  const getSelectedStreamId = () => {
    const state = useHomeStore.getState();
    return getHomeStreamIdFromFilters({
      sort: state.sort,
      reach: state.reach,
      content: resolveVisualFeedContent({ content: state.content, variant: feedVariant, isVisualActive }),
      currentUserPubky,
      profileTags: state.profileTags,
      taggedAsActive: state.taggedAsActive,
    });
  };

  // A filter change that selects a different stream starts that feed from the
  // top. The feed layout never resets `window.scrollY` on a same-route filter
  // change, so the new stream would otherwise inherit the previous offset.
  // Layout changes keep the stream and are not routed through here.
  const applyStreamFilter = (applyChange: () => void) => {
    const previousStreamId = getSelectedStreamId();
    applyChange();
    if (getSelectedStreamId() !== previousStreamId) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // "All" reach is public; other reach options require an account, so prompt Join Pubky in Explore mode.
  const handleReachChange = (value: ReachFilterValue) => {
    if (value === REACH.ALL) {
      // Signed-out Home already resolves to All. Avoid persisting this no-op as
      // an explicit choice so a visitor remains eligible for the post-signup
      // My-network default.
      if (isAuthenticated) {
        applyStreamFilter(() => setReach(value));
      }
      return;
    }

    requireAuth(() =>
      applyStreamFilter(() => {
        if (value === TAGGED_AS_FILTER_KEY) {
          setTaggedAsActive(true);
          return;
        }

        setReach(value as ReachType);
      }),
    );
  };
  const handleProfileTagAdd = (tag: string) => applyStreamFilter(() => addProfileTag(tag));
  const handleProfileTagRemove = (tag: string) => applyStreamFilter(() => removeProfileTag(tag));
  const handleSortChange = (value: SortType) => applyStreamFilter(() => setSort(value));
  const handleContentChange = (value: ContentType) => applyStreamFilter(() => setContent(value));
  const resolvedContent = resolveVisualFeedContent({
    content,
    variant: feedVariant,
    isVisualActive,
  });

  const disabledContentTabs = isVisualActive ? VISUAL_DISABLED_CONTENT : [];
  const showVisualLayout = allowVisualLayout && !isPhoneViewport;

  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      {!hideReachFilter && (
        <FilterReach
          selectedTab={selectedReach}
          onTabChange={handleReachChange}
          showTaggedAs
          profileTags={effectiveProfileTags}
          onProfileTagAdd={handleProfileTagAdd}
          onProfileTagRemove={handleProfileTagRemove}
          profileTagsDisabled={!isAuthenticated || !taggedAsActive}
        />
      )}
      {!hideSortFilter && <FilterSort selectedTab={sort} onTabChange={handleSortChange} />}
      {variant === 'sidebar' ? (
        <Container overrideDefaults className="sticky top-[100px] flex w-full flex-col gap-6 self-start">
          {!hideLayoutFilter && (
            <FilterLayout selectedTab={layout} onTabChange={setLayout} showVisual={showVisualLayout} />
          )}
          <FilterContent
            selectedTab={resolvedContent}
            onTabChange={handleContentChange}
            disabledTabs={disabledContentTabs}
          />
        </Container>
      ) : (
        <>
          {!hideLayoutFilter && (
            <FilterLayout selectedTab={layout} onTabChange={setLayout} showVisual={showVisualLayout} />
          )}
          <FilterContent
            selectedTab={resolvedContent}
            onTabChange={handleContentChange}
            disabledTabs={disabledContentTabs}
          />
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
  hideSortFilter = false,
  allowVisualLayout = false,
  feedVariant = TIMELINE_FEED_VARIANT.HOME,
}: HomeFeedSidebarProps) {
  return (
    <HomeFeedFilters
      hideReachFilter={hideReachFilter}
      hideSortFilter={hideSortFilter}
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
  hideSortFilter = false,
  allowVisualLayout = false,
  feedVariant = TIMELINE_FEED_VARIANT.HOME,
}: HomeFeedSidebarProps) {
  return (
    <HomeFeedFilters
      hideReachFilter={hideReachFilter}
      hideSortFilter={hideSortFilter}
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
  hideSortFilter = false,
  allowVisualLayout = false,
  feedVariant = TIMELINE_FEED_VARIANT.HOME,
}: HomeFeedSidebarProps) {
  return (
    <HomeFeedFilters
      hideReachFilter={hideReachFilter}
      hideSortFilter={hideSortFilter}
      hideLayoutFilter
      allowVisualLayout={allowVisualLayout}
      feedVariant={feedVariant}
      variant="drawer"
    />
  );
}
