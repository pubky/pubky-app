'use client';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isValidPostCompositeId } from '@/libs/utils/utils';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { PostNotFoundDiscoveryView } from '@/organisms/PostNotFoundDiscoveryView/PostNotFoundDiscoveryView';
import { SinglePostContent } from '@/organisms/SinglePostContent/SinglePostContent';
import { SinglePostContentSkeleton } from '@/organisms/SinglePostContent/SinglePostContent.skeleton';
import { SinglePostLeftDrawer, SinglePostLeftSidebar } from '@/organisms/SinglePostLeftSidebar/SinglePostLeftSidebar';
import { SinglePostRightPanel } from '@/organisms/SinglePostRightPanel/SinglePostRightPanel';
import type { SinglePostProps } from './SinglePost.types';

/**
 * SinglePost Template
 *
 * Displays a single post page with:
 * - Main post card (FULL WIDTH) with tags panel in two-column layout
 * - Below:  Replies timeline
 *
 * This template uses a FIXED layout that doesn't change based on user preferences.
 * When the post cannot be resolved after a local-first fetch, shows a discovery-style
 * not-found experience instead of an indefinite skeleton (#1769).
 * Malformed `/post/:pubky/:id` URLs (invalid pubky shape) use the same experience without a pointless fetch.
 */
export function SinglePost({ postId }: SinglePostProps) {
  const compositeValid = isValidPostCompositeId(postId);
  const { postDetails, isLoading } = usePostDetails(postId, { enabled: compositeValid });

  const postMissing = !compositeValid || (!isLoading && postDetails === null);
  if (postMissing) {
    return <PostNotFoundDiscoveryView postId={postId} />;
  }

  return (
    <ContentLayout
      classNameWrapperContent="gap-0"
      leftSidebarContent={<SinglePostLeftSidebar />}
      rightSidebarContent={<SinglePostRightPanel postId={postId} />}
      leftDrawerContent={<SinglePostLeftDrawer />}
      rightDrawerContent={<SinglePostRightPanel postId={postId} showFeedback={false} />}
    >
      {isLoading || !postDetails ? (
        <SinglePostContentSkeleton />
      ) : (
        <SinglePostContent postId={postId} postDetails={postDetails} />
      )}
    </ContentLayout>
  );
}
