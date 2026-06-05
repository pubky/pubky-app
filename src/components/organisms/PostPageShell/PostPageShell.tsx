'use client';

import type { PropsWithChildren } from 'react';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { SinglePostLeftDrawer, SinglePostLeftSidebar } from '@/organisms/SinglePostLeftSidebar/SinglePostLeftSidebar';
import { SinglePostRightPanel } from '@/organisms/SinglePostRightPanel/SinglePostRightPanel';

export interface PostPageShellProps extends PropsWithChildren {
  postId: string;
}

/**
 * App-shell chrome for `/post/[userId]/[postId]`.
 *
 * Sidebars and drawers only — search and navigation stay in the root `Header` on
 * desktop (`lg+`). On phone, the header is hidden on post pages and search is not
 * duplicated in the main column; signed-in users use {@link MobileFooter} for nav.
 *
 * Used by `app/post/[userId]/[postId]/layout.tsx` for direct navigation and by
 * {@link SinglePost} for the intercepted `(.)post` modal (which does not inherit
 * the post segment layout).
 */
export function PostPageShell({ postId, children }: PostPageShellProps) {
  return (
    <ContentLayout
      classNameWrapperContent="gap-0"
      leftSidebarContent={<SinglePostLeftSidebar />}
      rightSidebarContent={<SinglePostRightPanel postId={postId} />}
      leftDrawerContent={<SinglePostLeftDrawer />}
      rightDrawerContent={<SinglePostRightPanel postId={postId} showFeedback={false} />}
    >
      {children}
    </ContentLayout>
  );
}
