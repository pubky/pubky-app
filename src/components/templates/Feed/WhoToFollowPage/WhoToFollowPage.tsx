'use client';

import { useLayoutReset } from '@/hooks/useLayoutReset/useLayoutReset';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';

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
    <Organisms.ContentLayout
      leftSidebarContent={<Molecules.FilterSortWhoToFollow />}
      rightSidebarContent={
        <>
          <Organisms.ActiveUsers />
          <Atoms.Container overrideDefaults className="sticky top-25 self-start">
            <Organisms.FeedbackCard />
          </Atoms.Container>
        </>
      }
      leftDrawerContent={
        <Atoms.Container overrideDefaults className="flex flex-col gap-6">
          <Molecules.FilterSortWhoToFollow />
        </Atoms.Container>
      }
      rightDrawerContent={
        <Atoms.Container overrideDefaults className="flex flex-col gap-6">
          <Organisms.ActiveUsers />
          <Organisms.FeedbackCard />
        </Atoms.Container>
      }
    >
      <Organisms.WhoToFollowPageMain />
    </Organisms.ContentLayout>
  );
}
