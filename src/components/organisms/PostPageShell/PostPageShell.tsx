'use client';

import type { PropsWithChildren } from 'react';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { getDisplayedPostId } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility.utils';
import { usePostMissing } from '@/hooks/usePostMissing/usePostMissing';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { HotDiscoveryContentLayout } from '@/organisms/HotDiscoveryContentLayout/HotDiscoveryContentLayout';
import {
  SinglePostLeftDrawer,
  SinglePostLeftDrawerMobile,
  SinglePostLeftSidebar,
} from '@/organisms/SinglePostLeftSidebar/SinglePostLeftSidebar';
import { SinglePostRightPanel } from '@/organisms/SinglePostRightPanel/SinglePostRightPanel';

export interface PostPageShellProps extends PropsWithChildren {
  postId: string;
}

/**
 * App-shell layout for `/post/[userId]/[postId]`.
 *
 * Sidebars, drawers, and {@link MobileHeader} on phone — search and desktop nav
 * come from the root `Header` at `lg+` only; {@link MobileFooter} on smaller viewports.
 *
 * When the post is missing, swaps to the Hot-style discovery layout so the
 * not-found body ({@link PostNotFoundDiscoveryView}) sits inside exactly one
 * `ContentLayout`.
 *
 * Used by `app/post/[userId]/[postId]/layout.tsx` for direct navigation and by
 * {@link SinglePost} for the intercepted `(.)post` modal (which does not inherit
 * the post segment layout).
 */
export function PostPageShell({ postId, children }: PostPageShellProps) {
  const { postMissing } = usePostMissing(postId);
  const visibility = usePostHeaderVisibility(postId);
  const displayedPostId = getDisplayedPostId(postId, visibility);

  if (postMissing) {
    return <HotDiscoveryContentLayout>{children}</HotDiscoveryContentLayout>;
  }

  return (
    <ContentLayout
      classNameWrapperContent="gap-0"
      leftSidebarContent={<SinglePostLeftSidebar />}
      rightSidebarContent={<SinglePostRightPanel postId={displayedPostId} />}
      leftDrawerContent={<SinglePostLeftDrawer />}
      leftDrawerContentMobile={<SinglePostLeftDrawerMobile />}
      rightDrawerContent={<SinglePostRightPanel postId={displayedPostId} showFeedback={false} />}
    >
      {children}
    </ContentLayout>
  );
}
