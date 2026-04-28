'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Atoms from '@/atoms';
import { TIMELINE_FEED_VARIANT } from '@/config';
import { useSearchTags } from '@/hooks/useSearchStreamId/useSearchStreamId';

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
  // Get tags from URL query params
  const tags = useSearchTags();
  const isMobile = useIsMobile();
  const hasTags = tags.length > 0;

  return (
    <>
      <Organisms.DialogWelcome />
      <Organisms.ContentLayout
        feedVariant={TIMELINE_FEED_VARIANT.SEARCH}
        showRightMobileButton={false}
        leftSidebarContent={
          <Organisms.HomeFeedSidebar hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />
        }
        rightSidebarContent={<Organisms.HomeFeedRightSidebar />}
        leftDrawerContent={
          <Organisms.HomeFeedDrawer hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />
        }
        rightDrawerContent={<Organisms.HomeFeedRightDrawer />}
        leftDrawerContentMobile={
          <Organisms.HomeFeedDrawerMobile
            hideReachFilter
            allowVisualLayout
            feedVariant={TIMELINE_FEED_VARIANT.SEARCH}
          />
        }
      >
        {/* Mobile search input - hidden on desktop (shown in header there) */}
        <Atoms.Container className="lg:hidden">
          <Organisms.SearchInput autoFocus={!hasTags || isMobile} />
        </Atoms.Container>

        {hasTags ? (
          <>
            <Molecules.SearchHeader tags={tags} />
            <Atoms.Container data-cy="post-search-results" overrideDefaults>
              <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />
            </Atoms.Container>
          </>
        ) : (
          <Molecules.SearchEmptyState />
        )}
      </Organisms.ContentLayout>
    </>
  );
}
