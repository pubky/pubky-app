'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCollectionRoute } from '@/app/routes';
import { usePostMissing } from '@/hooks/usePostMissing/usePostMissing';
import { parseCompositeId } from '@/models/models.utils';
import { PostNotFoundDiscoveryView } from '@/organisms/PostNotFoundDiscoveryView/PostNotFoundDiscoveryView';
import { SinglePostContent } from '@/organisms/SinglePostContent/SinglePostContent';
import { SinglePostContentSkeleton } from '@/organisms/SinglePostContent/SinglePostContent.skeleton';
import type { SinglePostProps } from './SinglePost.types';

/**
 * Post page body: fetch post details and render content, skeleton, or not-found.
 *
 * Collections opened via `/post/...` are redirected to `/collections/...` — the
 * post page is not a valid surface for `kind=collection`.
 *
 * Shell layout (navigation, search, sidebars) lives in {@link PostPageShell}, either
 * from `app/post/[userId]/[postId]/layout.tsx` or via {@link SinglePost} for the
 * intercepted modal route. The shell shares {@link usePostMissing}, so it swaps to
 * the discovery layout whenever this body shows the not-found view.
 */
export function SinglePostPage({ postId }: SinglePostProps) {
  const router = useRouter();
  const { postMissing, postDetails, isLoading } = usePostMissing(postId);
  const isCollection = postDetails?.kind === 'collection';

  useEffect(() => {
    if (!isCollection) return;
    const { pubky, id } = parseCompositeId(postId);
    router.replace(getCollectionRoute(pubky, id));
  }, [isCollection, postId, router]);

  if (postMissing) {
    return <PostNotFoundDiscoveryView postId={postId} />;
  }

  if (isLoading || !postDetails || isCollection) {
    return <SinglePostContentSkeleton />;
  }

  return <SinglePostContent postId={postId} postDetails={postDetails} />;
}
