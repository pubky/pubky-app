'use client';
import { TagKind } from '@/application/tag/tag.types';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { PostUnavailable } from '@/molecules/PostUnavailable/PostUnavailable';
import { ClickableTagsList } from '@/organisms/ClickableTagsList/ClickableTagsList';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { PostContentBase } from '@/organisms/PostContentBase/PostContentBase';
import { PostHeader } from '@/organisms/PostHeader/PostHeader';
import { PostInlineTagsActions } from '@/organisms/PostInlineTagsActions/PostInlineTagsActions';

const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();

interface PostPreviewCardProps {
  /** Composite post ID to preview. */
  postId: string;
  /** Optional className on the outer Card wrapper (non-collection posts only). */
  className?: string;
  /**
   * When `false`, tags are read-only and the actions are hidden (share/repost
   * dialog): a collection's Follow/Delete CTAs, a post's action row. Feed repost
   * previews default to `true`.
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
  /**
   * Non-collection posts: show the previewed post's own tags and actions under
   * its content (default). `PostContent` passes `false` for a contentless repost,
   * whose own footer already acts on this post (`getInteractionPostId`).
   */
  showTagsActions?: boolean;
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
 * The previewed post's own web `embed` is passed down, so a quoted post with an external resource
 * embed shows that resource's card (compact: no action row or tag bar inside a preview), as its own
 * post does; a `pubky://` embed is a repost and is not followed.
 *
 * Collection originals skip the post-card shell and render `CollectionCard` with
 * `presentation="embed"`. Pass `interactiveActions={false}` from share/repost
 * dialogs so tags stay visible but non-interactive and CTAs are hidden; feed
 * repost previews keep full tag + Follow/Delete behavior (default).
 *
 * Under its content the previewed post has its own footer, the post's `PostInlineTagsActions`
 * (tags; Tag, Reply, Repost, Save, ⋯ on the `muted` surface, with its own Reply and Repost
 * dialogs), so its tags and counts read as its own, apart from the post around it. In the Reply
 * and Repost dialogs (`navigable={false}`) its tags show read-only and the action row is left
 * out, as for a collection embed, so nothing in the open modal opens another dialog.
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
  showTagsActions = true,
}: PostPreviewCardProps) {
  const { navigateToPost } = usePostNavigation();
  const { postDetails, isLoading } = usePostDetails(postId);
  const { embedUrl } = useRepostInfo(postId);
  const { openReplyDialog, openRepostDialog, dialogs } = usePostReplyRepostDialogs(postId);
  const hasActionRow = showTagsActions && navigable && interactiveActions;
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
    // Only the card itself: Enter or Space on a control inside (tags, actions) does what that control does.
    if (e.target !== e.currentTarget) return;
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
    <>
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
            <PostPreviewNestingProvider navigable={navigable}>
              <PostHeader postId={postId} showPopover={false} timeAgoPlacement="bottom-left" navigable={navigable} />
              <PostContentBase postId={postId} embedUrl={embedUrl} />
            </PostPreviewNestingProvider>
            {/* Outside the nesting: the footer's menus (Edit post) are no embedded preview. */}
            {showTagsActions &&
              (hasActionRow ? (
                <PostInlineTagsActions
                  postId={postId}
                  surface="muted"
                  onReplyClick={openReplyDialog}
                  onRepostClick={openRepostDialog}
                  // Container queries on the footer's own width: in a narrow quote (a phone) the buttons close up,
                  // so ⋯ stays on their row, in the steps of a resource card's footer (the second from 17rem: counts
                  // of two digits still fit at 390 px).
                  className="@container/post-preview-actions"
                  actionsClassName={cn(
                    'w-full shrink-0 justify-start sm:w-auto md:justify-end @max-xl/grid:w-full! @max-xl/grid:justify-start!',
                    '@max-sm/post-preview-actions:gap-1.5 @max-sm/post-preview-actions:[&>*]:px-2.5!',
                    '@max-[17rem]/post-preview-actions:gap-1 @max-[17rem]/post-preview-actions:[&>*]:gap-1! @max-[17rem]/post-preview-actions:[&>*]:px-2!',
                    '@max-[14.5rem]/post-preview-actions:[&>*]:px-1.5!',
                    '@max-[13.75rem]/post-preview-actions:gap-0.5',
                  )}
                />
              ) : (
                <ClickableTagsList
                  taggedId={postId}
                  taggedKind={TagKind.POST}
                  maxTagLength={POST_TAGS_MAX_LENGTH}
                  maxTotalChars={POST_TAGS_MAX_TOTAL_CHARS}
                  showCount={true}
                  showInput={false}
                  showAddButton={false}
                  readOnly
                />
              ))}
          </CardContent>
        )}
      </Card>
      {/* Outside the card: a click in a dialog portal still bubbles through React. */}
      {hasActionRow && (
        <Container overrideDefaults className="contents" onClick={stopPropagation} onAuxClick={stopPropagation}>
          {dialogs}
        </Container>
      )}
    </>
  );
}
