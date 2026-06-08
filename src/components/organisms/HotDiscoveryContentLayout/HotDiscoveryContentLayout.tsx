'use client';

import type { PropsWithChildren } from 'react';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { HotFeedRightDrawer, HotFeedRightSidebar } from '@/organisms/FeedRightSidebar/FeedRightSidebar';
import { HotFeedDrawer, HotFeedSidebar } from '@/organisms/HotFeedFilters/HotFeedFilters';

/**
 * Shared Hot-style `ContentLayout` shell: sidebars, drawers, and padding match {@link Hot}.
 * Keeps discovery / empty-state routes visually aligned with the Hot feed page.
 */
export function HotDiscoveryContentLayout({ children }: PropsWithChildren) {
  return (
    <ContentLayout
      showRightMobileButton={false}
      hasGradientBackground={false}
      leftSidebarContent={<HotFeedSidebar />}
      rightSidebarContent={<HotFeedRightSidebar />}
      leftDrawerContent={<HotFeedDrawer />}
      rightDrawerContent={<HotFeedRightDrawer />}
      className="pb-24 lg:pb-12"
      disableWideShellLayout
      classNameMobileHeader="pb-0"
    >
      {children}
    </ContentLayout>
  );
}
