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
 * Sidebars and drawers only — search and navigation come from the root `Header`
 * (signed-in users keep it visible on post pages, including phone) and
 * {@link MobileFooter} on smaller viewports, matching the `/home` app shell.
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
