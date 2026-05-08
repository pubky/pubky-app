'use client';

import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchTags } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { SearchEmptyState } from '@/molecules/SearchEmptyState/SearchEmptyState';
import { SearchHeader } from '@/molecules/SearchHeader/SearchHeader';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { DialogWelcome } from '@/organisms/DialogWelcome/DialogWelcome';
import { HomeFeedRightDrawer, HomeFeedRightSidebar } from '@/organisms/FeedRightSidebar/FeedRightSidebar';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '@/organisms/HomeFeedSidebar/HomeFeedSidebar';
import { SearchInput } from '@/organisms/SearchInput/SearchInput';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

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
      <DialogWelcome />
      <ContentLayout
        feedVariant={TIMELINE_FEED_VARIANT.SEARCH}
        showRightMobileButton={false}
        leftSidebarContent={
          <HomeFeedSidebar hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />
        }
        rightSidebarContent={<HomeFeedRightSidebar />}
        leftDrawerContent={
          <HomeFeedDrawer hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />
        }
        rightDrawerContent={<HomeFeedRightDrawer />}
        leftDrawerContentMobile={
          <HomeFeedDrawerMobile hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />
        }
      >
        {/* Mobile search input - hidden on desktop (shown in header there) */}
        <Container className="lg:hidden">
          <SearchInput autoFocus={!hasTags || isMobile} />
        </Container>

        {hasTags ? (
          <>
            <SearchHeader tags={tags} />
            <Container data-cy="post-search-results" overrideDefaults>
              <TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />
            </Container>
          </>
        ) : (
          <SearchEmptyState />
        )}
      </ContentLayout>
    </>
  );
}
