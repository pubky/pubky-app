'use client';

import type { PropsWithChildren, ReactNode } from 'react';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import {
  SinglePostLeftDrawer,
  SinglePostLeftDrawerMobile,
  SinglePostLeftSidebar,
} from '@/organisms/SinglePostLeftSidebar/SinglePostLeftSidebar';

export interface PostPageLayoutProps extends PropsWithChildren {
  /** The right column on desktop (`lg+`): the page's sidebar cards. */
  rightSidebarContent: ReactNode;
  /** The right drawer, opened from the mobile header and, in the wide shell, the right edge button. */
  rightDrawerContent: ReactNode;
  /** Whether the mobile header opens the right drawer (for a page that shows its cards inline there). */
  showRightMobileButton?: boolean;
  /** Extra classes for the page's grid (e.g. room under the content for the floating button). */
  className?: string;
}

/**
 * The single post page's layout: the post filters in the left column and left drawer, the page's
 * sidebar cards in the right column and right drawer, the page body between them.
 *
 * {@link PostPageShell} fills it for `/post/[userId]/[postId]`; the external resource page
 * (`/resource?uri=…`) uses it too, so both read as the same kind of page.
 */
export function PostPageLayout({
  rightSidebarContent,
  rightDrawerContent,
  showRightMobileButton = true,
  className,
  children,
}: PostPageLayoutProps) {
  return (
    <ContentLayout
      classNameWrapperContent="gap-0"
      leftSidebarContent={<SinglePostLeftSidebar />}
      rightSidebarContent={rightSidebarContent}
      leftDrawerContent={<SinglePostLeftDrawer />}
      leftDrawerContentMobile={<SinglePostLeftDrawerMobile />}
      rightDrawerContent={rightDrawerContent}
      showRightMobileButton={showRightMobileButton}
      className={className}
    >
      {children}
    </ContentLayout>
  );
}
