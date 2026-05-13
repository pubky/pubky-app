'use client';

import { Container } from '@/atoms/Container/Container';
import { useLayoutReset } from '@/hooks/useLayoutReset/useLayoutReset';
import { FilterSortWhoToFollow } from '@/molecules/Filters/FilterSortWhoToFollow/FilterSortWhoToFollow';
import { ActiveUsers } from '@/organisms/ActiveUsers/ActiveUsers';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { FeedbackCard } from '@/organisms/FeedbackCard/FeedbackCard';
import { WhoToFollow } from '@/organisms/WhoToFollow/WhoToFollow';

/**
 * WhoToFollowPage
 *
 * Template for the Who To Follow page.
 * Displays a full list of recommended users to follow.
 *
 * Layout:
 * - Left sidebar: Sort options (disabled placeholders for now)
 * - Main content: Full list of recommended users with infinite scroll
 * - Right sidebar: ActiveUsers and FeedbackCard
 */
export function WhoToFollowPage() {
  // Reset to column layout on mount (this page doesn't support wide)
  useLayoutReset();

  return (
    <ContentLayout
      leftSidebarContent={<FilterSortWhoToFollow />}
      rightSidebarContent={
        <>
          <ActiveUsers />
          <Container overrideDefaults className="sticky top-25 self-start">
            <FeedbackCard />
          </Container>
        </>
      }
      leftDrawerContent={
        <Container overrideDefaults className="flex flex-col gap-6">
          <FilterSortWhoToFollow />
        </Container>
      }
      rightDrawerContent={
        <Container overrideDefaults className="flex flex-col gap-6">
          <ActiveUsers />
          <FeedbackCard />
        </Container>
      }
    >
      <WhoToFollow />
    </ContentLayout>
  );
}
