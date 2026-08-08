'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { PostUnavailable } from '@/molecules/PostUnavailable/PostUnavailable';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { PostContentBase } from '@/organisms/PostContentBase/PostContentBase';
import { PostHeader } from '@/organisms/PostHeader/PostHeader';

interface PostPreviewCardProps {
  /** Composite post ID to preview. */
  postId: string;
  /** Optional className on the outer Card wrapper (non-collection posts only). */
  className?: string;
  /**
   * Collection embed only: when `false`, tags are read-only and Follow/Delete
   * CTAs are hidden (share/repost dialog). Feed repost previews default to `true`.
   */
  interactiveActions?: boolean;
}

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
 * Both branches also provide PostPreviewNestingContext so PostLinkEmbeds suppresses
 * in-app link embeds inside the preview — mutually-linking posts would otherwise
 * recurse through PostContentBase → PostLinkEmbeds → PostPreviewCard.
 *
 * Collection originals skip the post-card shell and render `CollectionCard` with
 * `presentation="embed"`. Pass `interactiveActions={false}` from share/repost
 * dialogs so tags stay visible but non-interactive and CTAs are hidden; feed
 * repost previews keep full tag + Follow/Delete behavior (default).
 *
 * **TTL Tracking:**
 * Subscribes the original post to TTL tracking when visible in the viewport.
 * This ensures original posts for reposts get refreshed when stale.
 *
 * **Usage:**
 * - Repost previews: original post in `PostContent` (collections use embed `CollectionCard`)
 * - Share dialog: original post in `PostInput` repost variant
 * - Reply previews: post being replied to in `DialogReply` (non-collection posts only)
 */
export function PostPreviewCard({ postId, className, interactiveActions = true }: PostPreviewCardProps) {
  const t = useTranslations('post');
  const { navigateToPost } = usePostNavigation();
  const { postDetails, isLoading } = usePostDetails(postId);
  const { ref: ttlRef } = useTtlSubscription({
    type: 'post',
    id: postId,
  });
  // A settled `null` means the original post 404'd. Handle it at the card level
  // (not just in PostContentBase): the PostHeader below also waits on
  // `postDetails`, so it would skeleton forever for a missing original. Render
  // PostUnavailable as a direct Card child (it IS a CardContent) so it isn't nested
  // inside the inner CardContent — matching how PostMain renders unavailable posts.
  const isMissing = postDetails === null && !isLoading;
  // Deleted originals are also handled at the card level so the header is
  // hidden — matching PostMain's isMissing → isDeleted → content ladder.
  const isDeleted = isPostDeleted(postDetails?.content);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigateToPost(postId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
      e.preventDefault();
      navigateToPost(postId);
    }
  };

  if (postDetails?.kind === 'collection' && !isDeleted) {
    const { pubky, id } = parseCompositeId(postId);
    return (
      <PostPreviewNestingProvider>
        <Container ref={ttlRef} data-cy="post-preview-card" overrideDefaults className="min-w-0">
          <CollectionCard
            authorPubky={pubky}
            postId={id}
            presentation="embed"
            interactiveActions={interactiveActions}
            className="w-full"
          />
        </Container>
      </PostPreviewNestingProvider>
    );
  }

  return (
    <PostPreviewNestingProvider>
      <Card
        ref={ttlRef}
        data-cy="post-preview-card"
        className={cn(
          'w-full max-w-full min-w-0 cursor-pointer rounded-md py-0 transition-colors hover:bg-accent/50',
          className,
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="link"
        tabIndex={0}
        aria-label="View original post"
      >
        {isMissing ? (
          <PostUnavailable message={t('missing')} />
        ) : isDeleted ? (
          <PostUnavailable message={t('deleted')} />
        ) : (
          <CardContent className="flex w-full max-w-full min-w-0 flex-col gap-4 p-6">
            <PostHeader postId={postId} showPopover={false} timeAgoPlacement="bottom-left" />
            <PostContentBase postId={postId} />
          </CardContent>
        )}
      </Card>
    </PostPreviewNestingProvider>
  );
}
