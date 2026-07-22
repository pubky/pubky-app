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
 * Shell layout (navigation, search, sidebars) lives in {@link PostPageShell}, either
 * from `app/post/[userId]/[postId]/layout.tsx` or via {@link SinglePost} for the
 * intercepted modal route. The shell shares {@link usePostMissing}, so it swaps to
 * the discovery layout whenever this body shows the not-found view.
 */
export function SinglePostPage({ postId }: SinglePostProps) {
  const router = useRouter();
  const { postMissing, postDetails, isLoading } = usePostMissing(postId);

  // Collection-kind posts canonically live at /collections. The server-side
  // permanentRedirect in app/post/[userId]/[postId]/page.tsx only covers full
  // document loads (and even there arrives as a streamed 200, not a real 308):
  // client-side navigations either skip it (intercepted `(.)post` route) or the
  // Next 16 router fails to act on the streamed redirect. This guard covers all
  // client-side paths using the post data we fetch anyway.
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
