'use client';

import type { PropsWithChildren } from 'react';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { getInteractionPostId } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility.utils';
import { usePostMissing } from '@/hooks/usePostMissing/usePostMissing';
import { HotDiscoveryContentLayout } from '@/organisms/HotDiscoveryContentLayout/HotDiscoveryContentLayout';
import { SinglePostRightPanel } from '@/organisms/SinglePostRightPanel/SinglePostRightPanel';
import { PostPageLayout } from './PostPageLayout';

export interface PostPageShellProps extends PropsWithChildren {
  postId: string;
}

/**
 * App-shell layout for `/post/[userId]/[postId]`.
 *
 * Sidebars, drawers, and {@link MobileHeader} on phone — search and desktop nav
 * come from the root `Header` at `lg+` only; {@link MobileFooter} on smaller viewports.
 * The columns are {@link PostPageLayout}'s, with the thread's participants on the right.
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
  // Participants of a contentless repost's thread are the original's, for every viewer.
  const displayedPostId = getInteractionPostId(postId, visibility);

  if (postMissing) {
    return <HotDiscoveryContentLayout>{children}</HotDiscoveryContentLayout>;
  }

  return (
    <PostPageLayout
      rightSidebarContent={<SinglePostRightPanel postId={displayedPostId} />}
      rightDrawerContent={<SinglePostRightPanel postId={displayedPostId} showFeedback={false} />}
    >
      {children}
    </PostPageLayout>
  );
}
