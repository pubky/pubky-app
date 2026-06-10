'use client';

import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isValidPostCompositeId } from '@/libs/utils/utils';
import { PostNotFoundDiscoveryView } from '@/organisms/PostNotFoundDiscoveryView/PostNotFoundDiscoveryView';
import { SinglePostContent } from '@/organisms/SinglePostContent/SinglePostContent';
import { SinglePostContentSkeleton } from '@/organisms/SinglePostContent/SinglePostContent.skeleton';
import type { SinglePostProps } from './SinglePost.types';

/**
 * Post page body: fetch post details and render content, skeleton, or not-found.
 *
 * Shell chrome (navigation, search, sidebars) lives in {@link PostPageShell}, either
 * from `app/post/[userId]/[postId]/layout.tsx` or via {@link SinglePost} for the
 * intercepted modal route.
 */
export function SinglePostPage({ postId }: SinglePostProps) {
  const compositeValid = isValidPostCompositeId(postId);
  const { postDetails, isLoading } = usePostDetails(postId, { enabled: compositeValid });

  const postMissing = !compositeValid || (!isLoading && postDetails === null);
  if (postMissing) {
    return <PostNotFoundDiscoveryView postId={postId} />;
  }

  if (isLoading || !postDetails) {
    return <SinglePostContentSkeleton />;
  }

  return <SinglePostContent postId={postId} postDetails={postDetails} />;
}
