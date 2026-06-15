'use client';

import { usePostMissing } from '@/hooks/usePostMissing/usePostMissing';
import { PostNotFoundDiscoveryView } from '@/organisms/PostNotFoundDiscoveryView/PostNotFoundDiscoveryView';
import { SinglePostContent } from '@/organisms/SinglePostContent/SinglePostContent';
import { SinglePostContentSkeleton } from '@/organisms/SinglePostContent/SinglePostContent.skeleton';
import type { SinglePostProps } from './SinglePost.types';

/**
 * Post page body: fetch post details and render content, skeleton, or not-found.
 *
 * Shell layout (navigation, search, sidebars) lives in {@link PostPageShell}, either
 * from `app/post/[userId]/[postId]/layout.tsx` or via {@link SinglePost} for the
 * intercepted modal route. The shell shares {@link usePostMissing}, so it swaps to
 * the discovery layout whenever this body shows the not-found view.
 */
export function SinglePostPage({ postId }: SinglePostProps) {
  const { postMissing, postDetails, isLoading } = usePostMissing(postId);

  if (postMissing) {
    return <PostNotFoundDiscoveryView postId={postId} />;
  }

  if (isLoading || !postDetails) {
    return <SinglePostContentSkeleton />;
  }

  return <SinglePostContent postId={postId} postDetails={postDetails} />;
}
