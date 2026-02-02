'use client';

import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import { TIMELINE_FEED_VARIANT } from '@/organisms/TimelineFeed/TimelineFeed.types';
import { useSearchTags } from '@/hooks/useSearchStreamId';

/**
 * Search Template
 *
 * Template for the Search page that displays posts filtered by tags.
 * Tags are parsed from URL query parameters (?tags=pubky,bitcoin).
 *
 * Features:
 * - Displays search results when tags are provided
 * - Shows empty state when no tags in URL
 * - Reuses HomeFeedSidebar for sort/content filters
 * - Uses TimelineFeed with SEARCH variant for infinite scroll
 * - Shows SearchInput on mobile (hidden on desktop where it's in the header)
 */
export function Search() {
  // Reset to column layout on mount (this page doesn't support wide)
  Hooks.useLayoutReset();

  // Get tags from URL query params
  const tags = useSearchTags();
  const hasTags = tags.length > 0;

  return (
    <>
      <Organisms.DialogWelcome />
      <Organisms.ContentLayout
        showRightMobileButton={false}
        leftSidebarContent={<Organisms.HomeFeedSidebar hideReachFilter />}
        rightSidebarContent={<Organisms.HomeFeedRightSidebar />}
        leftDrawerContent={<Organisms.HomeFeedDrawer hideReachFilter />}
        rightDrawerContent={<Organisms.HomeFeedRightDrawer />}
        leftDrawerContentMobile={<Organisms.HomeFeedDrawerMobile hideReachFilter />}
      >
        {/* Mobile search input - hidden on desktop (shown in header there) */}
        <Atoms.Container className="lg:hidden">
          <Organisms.SearchInput />
        </Atoms.Container>

        {hasTags ? (
          <>
            <Molecules.SearchHeader tags={tags} />
            <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />
          </>
        ) : (
          <Molecules.SearchEmptyState />
        )}
      </Organisms.ContentLayout>
    </>
  );
}
