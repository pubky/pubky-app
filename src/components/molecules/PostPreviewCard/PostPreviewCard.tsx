'use client';
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
  /**
   * Collection embed only: squares the top corners so the card sits flush
   * under the RepostHeader bar in full-bleed contentless collection shares.
   */
  flush?: boolean;
  /**
   * When `false`, the preview is a plain surface: the card loses its link role,
   * focus stop, pointer cursor and click/Enter/Space navigation, a collection
   * original renders without its link wrapper, and the author, mentions and
   * hashtags inside render as text. The Reply and Repost dialogs pass `false`
   * so nothing in the quoted post can change the route behind the open modal.
   * Feed previews default to `true`.
   */
  navigable?: boolean;
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
 * recurse through PostContentBase → PostLinkEmbeds → PostPreviewCard. The same
 * provider carries `navigable` down to the mention and hashtag renderers, which
 * sit too deep in the markdown render for a prop.
 *
 * Collection originals skip the post-card shell and render `CollectionCard` with
 * `presentation="embed"`. Pass `interactiveActions={false}` from share/repost
 * dialogs so tags stay visible but non-interactive and CTAs are hidden; feed
 * repost previews keep full tag + Follow/Delete behavior (default).
 *
 * **TTL Tracking:**
 * Subscribes the original post to TTL tracking when visible in the viewport.
 * This ensures original posts for reposts get refreshed when stale. For
 * collection originals this wrapper is the embed's subscriber — the nested
 * `CollectionCard` skips its own subscription for `presentation="embed"`
 * since a second one would only add a redundant viewport observer.
 *
 * **Usage:**
 * - Repost previews: original post in `PostContent` (collections use embed `CollectionCard`)
 * - Share dialog: original post in `PostInput` repost variant (`navigable={false}`)
 * - Reply previews: post being replied to in `DialogReply` (non-collection posts only,
 *   rendered with `navigable={false}` so the modal stays the only surface in play)
 */
export function PostPreviewCard({
  postId,
  className,
  interactiveActions = true,
  flush = false,
  navigable = true,
}: PostPreviewCardProps) {
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
  const isDeleted = isPostDeleted(postDetails);

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
      <PostPreviewNestingProvider navigable={navigable}>
        <Container ref={ttlRef} data-cy="post-preview-card" overrideDefaults className="min-w-0">
          <CollectionCard
            authorPubky={pubky}
            postId={id}
            presentation="embed"
            interactiveActions={interactiveActions}
            navigable={navigable}
            className={cn('w-full', flush && 'rounded-t-none rounded-b-md')}
          />
        </Container>
      </PostPreviewNestingProvider>
    );
  }

  return (
    <PostPreviewNestingProvider navigable={navigable}>
      <Card
        ref={ttlRef}
        data-cy="post-preview-card"
        className={cn(
          'w-full max-w-full min-w-0 rounded-md py-0',
          navigable && 'cursor-pointer transition-colors hover:bg-accent/50',
          className,
        )}
        onClick={navigable ? handleClick : undefined}
        onKeyDown={navigable ? handleKeyDown : undefined}
        role={navigable ? 'link' : undefined}
        tabIndex={navigable ? 0 : undefined}
        aria-label={navigable ? 'View original post' : undefined}
      >
        {isMissing ? (
          <PostUnavailable message={'Post not found.'} />
        ) : isDeleted ? (
          <PostUnavailable message={'This post has been deleted by its author.'} />
        ) : (
          <CardContent className="flex w-full max-w-full min-w-0 flex-col gap-4 p-6">
            <PostHeader postId={postId} showPopover={false} timeAgoPlacement="bottom-left" navigable={navigable} />
            <PostContentBase postId={postId} />
          </CardContent>
        )}
      </Card>
    </PostPreviewNestingProvider>
  );
}
