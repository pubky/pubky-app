'use client';

import { Card, CardContent } from '@/atoms/Card/Card';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { cn } from '@/libs/utils/utils';
import { PostMissing } from '@/molecules/PostMissing/PostMissing';
import { PostContentBase } from '@/organisms/PostContentBase/PostContentBase';
import { PostHeader } from '@/organisms/PostHeader/PostHeader';
import type { PostPreviewCardProps } from './PostPreviewCard.types';

/**
 * PostPreviewCard - Compact preview card for displaying a post in a nested context.
 *
 * **Purpose:**
 * Renders a compact, read-only preview of a post within another post's context.
 * Used primarily for displaying the original post when viewing a repost or reply.
 *
 * **Key Design Decision:**
 * Uses PostContentBase instead of PostContent to prevent infinite repost nesting.
 * If PostContent were used, it would detect the nested post as a repost and render
 * another PostPreviewCard, creating an infinite loop.
 *
 * **TTL Tracking:**
 * Subscribes the original post to TTL tracking when visible in the viewport.
 * This ensures original posts for reposts get refreshed when stale.
 *
 * **Usage:**
 * - Repost previews: Shows the original post being reposted (in PostContent)
 * - Reply previews: Shows the post being replied to (in DialogReply)
 * - Any nested context where a compact post preview is needed
 */
export function PostPreviewCard({ postId, className, contrast }: PostPreviewCardProps) {
  const { navigateToPost, navigateToCollection } = usePostNavigation();
  const { postDetails, isLoading } = usePostDetails(postId);
  const { ref: ttlRef } = useTtlSubscription({
    type: 'post',
    id: postId,
  });
  // A settled `null` means the original post 404'd. Handle it at the card level
  // (not just in PostContentBase): the PostHeader below also waits on
  // `postDetails`, so it would skeleton forever for a missing original. Render
  // PostMissing as a direct Card child (it IS a CardContent) so it isn't nested
  // inside the inner CardContent — matching how PostMain renders PostDeleted.
  const isMissing = postDetails === null && !isLoading;
  const isCollection = postDetails?.kind === 'collection';

  const navigateToPreview = () => {
    if (isCollection) {
      navigateToCollection(postId);
      return;
    }

    navigateToPost(postId);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigateToPreview();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
      e.preventDefault();
      navigateToPreview();
    }
  };

  return (
    <Card
      ref={ttlRef}
      data-cy="post-preview-card"
      className={cn('min-w-0 cursor-pointer rounded-md py-0 transition-colors hover:bg-accent/50', className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
      aria-label={isCollection ? 'View collection' : 'View original post'}
    >
      {isMissing ? (
        <PostMissing />
      ) : (
        <CardContent className="flex min-w-0 flex-col gap-4 p-6">
          <PostHeader postId={postId} showPopover={false} timeAgoPlacement="bottom-left" />
          <PostContentBase postId={postId} contrast={contrast} />
        </CardContent>
      )}
    </Card>
  );
}
