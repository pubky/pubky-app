'use client';

import { Container } from '@/atoms/Container/Container';
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
 * - Main content: One list of every recommended user the cached stream holds, topped up once from Nexus
 * - Right sidebar: ActiveUsers and FeedbackCard
 */
export function WhoToFollowPage() {
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
      disableWideShellLayout
    >
      <WhoToFollow />
    </ContentLayout>
  );
}
