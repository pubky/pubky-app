'use client';

import { type MouseEvent, useState } from 'react';
import { Library, Minus, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getCollectionRoute } from '@/app/routes';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { useDeletePost } from '@/hooks/useDeletePost/useDeletePost';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { parseCollectionContent, resolveCollectionCoverImage } from '@/libs/post/collectionContent';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { CollectionCountBadge } from '@/molecules/CollectionCountBadge/CollectionCountBadge';
import { CollectionDeleted } from '@/molecules/CollectionDeleted/CollectionDeleted';
import { CollectionMissing } from '@/molecules/CollectionMissing/CollectionMissing';
import { DialogConfirmDelete } from '@/molecules/DialogConfirmDelete/DialogConfirmDelete';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { CollectionCardSkeleton } from '@/organisms/Collections/CollectionCard/CollectionCard.skeleton';
import { CollectionCardBlurred } from '@/organisms/Collections/CollectionCard/CollectionCardBlurred';
import { PostTagsExpandableRow } from '@/organisms/PostTagsExpandableRow/PostTagsExpandableRow';
import { PostTagToggleButton } from '@/organisms/PostTagsExpandableRow/PostTagToggleButton';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

interface CollectionCardProps {
  /** Collection owner pubky. */
  authorPubky: Pubky;
  /** Collection post id (raw, not composite). */
  postId: string;
  className?: string;
  /**
   * Seed for the bookmark hook's initial state. Set to `true` from contexts
   * where the card is known to represent a followed collection (e.g. the
   * Followed section) so the action button doesn't flash "Follow" before the
   * async existence check resolves to "Unfollow".
   */
  initialIsBookmarked?: boolean;
  /**
   * `'default'` (landing sections) renders the full card with inline tags and
   * the Follow/Delete action. `'preview'` is the read-only embed used wherever
   * a collection post is rendered as content (inline in a feed, or nested in
   * another preview surface) — actions and tags row are dropped.
   */
  variant?: 'default' | 'preview';
  /**
   * Background contrast for the `preview` variant. `'subtle'` (default) uses
   * `bg-muted` and is right when the parent is one `bg-card` step away.
   * `'strong'` uses `bg-accent` for deeper nesting (e.g. timeline reposts,
   * where the surrounding PostPreviewCard is itself already `bg-muted`).
   * Ignored when there is a cover image (the cover overlay handles contrast).
   */
  contrast?: 'subtle' | 'strong';
}

/**
 * CollectionCard
 *
 * Renders a single collection (a `kind=Collection` post) for the Collections
 * landing sections and the single-collection sidebar. Self-contained: derives
 * title / description / cover / item count / owner profile / tags / ownership
 * locally from `(authorPubky, postId)`, so callers stay thin.
 *
 * Two-stage render: while `usePostDetails` is resolving (`undefined`) we
 * render `CollectionCardSkeleton` so the card never flashes a half-empty
 * state (title='', itemCount=0, etc.). Once details land we delegate to
 * `CollectionCardContent` with `postDetails` as a non-null prop. The
 * separation also keeps hook ordering clean — the content component owns
 * all the hooks that depend on the loaded envelope (`useBookmark` toast
 * copy reads from the parsed title, etc.).
 */
export function CollectionCard({
  authorPubky,
  postId,
  className,
  initialIsBookmarked,
  variant = 'default',
  contrast = 'subtle',
}: CollectionCardProps) {
  const compositeId = buildCompositeId({ pubky: authorPubky, id: postId });
  const { postDetails, isLoading } = usePostDetails(compositeId);

  if (!postDetails) {
    // `undefined`/in-flight → skeleton; a settled `null` means the collection
    // post 404'd, so show the terminal "not found" card instead of skeletoning
    // forever. Defensive — mirrors the post fix for the theoretical 404 case.
    return isLoading ? <CollectionCardSkeleton className={className} /> : <CollectionMissing className={className} />;
  }

  // Soft-deleted collections (`content === '[DELETED]'`) render the standard
  // deleted-card fallback instead of an empty card. Short-circuits before
  // `parseCollectionContent` is ever called against the `[DELETED]` sentinel.
  // `CollectionDeleted` owns its full card shell — no wrappers needed here.
  if (isPostDeleted(postDetails.content)) {
    return <CollectionDeleted className={className} />;
  }

  // Moderated collections render a blurred, same-footprint placeholder instead
  // of their content. Checked after the deleted guard (a deleted collection
  // wins) and mirrors `PostContentBase`'s blur intercept — direct-render
  // surfaces (landing sections) need their own check since they bypass it.
  if (postDetails.is_blurred) {
    return <CollectionCardBlurred compositeId={compositeId} className={className} />;
  }

  return (
    <CollectionCardContent
      authorPubky={authorPubky}
      postId={postId}
      compositeId={compositeId}
      postDetails={postDetails}
      className={className}
      initialIsBookmarked={initialIsBookmarked}
      variant={variant}
      contrast={contrast}
    />
  );
}

interface CollectionCardContentProps {
  authorPubky: Pubky;
  postId: string;
  compositeId: string;
  postDetails: EnrichedPostDetails;
  className?: string;
  initialIsBookmarked?: boolean;
  variant: 'default' | 'preview';
  contrast: 'subtle' | 'strong';
}

function CollectionCardContent({
  authorPubky,
  postId,
  compositeId,
  postDetails,
  className,
  initialIsBookmarked,
  variant,
  contrast,
}: CollectionCardContentProps) {
  const isPreview = variant === 'preview';
  const t = useTranslations('collections.card');
  const tCardToast = useTranslations('collections.card.toast');

  const { profile: ownerProfile } = useUserProfile(authorPubky);

  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isOwn = currentUserPubky === authorPubky;
  const { requireAuth } = useRequireAuth();

  const collection = parseCollectionContent(postDetails.content);

  const title = collection?.name ?? '';

  // Override the generic "Bookmark added / removed" toast copy so collection
  // Follow / Unfollow reads as a collection action.
  const { isBookmarked, isToggling, toggle } = useBookmark(compositeId, {
    toastMessages: {
      added: tCardToast('followed'),
      removed: tCardToast('unfollowed'),
    },
    initialIsBookmarked,
  });

  const description = collection?.description?.trim() ?? '';
  const itemCount = collection?.items?.length ?? 0;

  // Prefer a recently-uploaded blob URL stashed in the local-files store so the
  // cover renders instantly after create/edit while the CDN catches up.
  const localCoverUrl = useLocalFilesStore((s) => s.collections[compositeId]);
  const coverImage = localCoverUrl ?? resolveCollectionCoverImage(collection?.cover_image);

  const ownerName = ownerProfile?.name || authorPubky;
  const ownerAvatarUrl = ownerProfile?.avatarUrl;

  const href = getCollectionRoute(authorPubky, postId);

  // Suppresses card navigation for clicks inside the wrapping `<Link>` subtree.
  // Both calls are required: `preventDefault` blocks the native `<a>` default
  // action; `stopPropagation` keeps the event from reaching any parent React
  // handlers (and is harmless when called on a leaf handler).
  const suppressCardNavigation = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFollowToggle = (event: MouseEvent) => {
    suppressCardNavigation(event);
    if (isToggling) return;
    requireAuth(() => {
      void toggle();
    });
  };

  // Collection-specific toast copy so success / failure reads as "Collection
  // deleted" rather than "Post deleted". `useDeletePost` falls back to the
  // generic `toast.post.*` strings for any field we omit.
  const tCollectionToast = useTranslations('toast.collection');
  const tDeleteCollection = useTranslations('dialogs.deleteCollection');
  const deleteCollectionDescription = tDeleteCollection('description', { name: title || authorPubky });
  const { deletePost, isDeleting } = useDeletePost({
    toastMessages: {
      deleted: tCollectionToast('collectionDeleted'),
      deleteFailed: tCollectionToast('deleteFailed'),
    },
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const handleDelete = (event: MouseEvent) => {
    suppressCardNavigation(event);
    setDeleteConfirmOpen(true);
  };

  const handleTagToggle = (event: MouseEvent<HTMLButtonElement>) => {
    suppressCardNavigation(event);
    setTagsExpanded((prev) => !prev);
  };

  const handleDeleteConfirm = () => {
    void deletePost(compositeId);
  };

  return (
    <>
      <Link
        overrideDefaults
        href={href}
        aria-label={title}
        data-cy="collection-card"
        className={cn('group relative block h-full w-full lg:max-w-187', className)}
      >
        <Card
          className={cn(
            // `isolate` creates a new stacking context so the cover image at `-z-10`
            // stays behind this card's content but does not slip behind an enclosing
            // post card's opaque background when nested in `PostContentBase`.
            'relative isolate h-full gap-0 overflow-hidden rounded-md py-0',
            coverImage && 'border-transparent bg-card/40',
            // Preview contexts pick their bg based on how nested they are:
            // one card-step deep (inline feed, dialog repost) reads fine on `bg-muted`,
            // two steps deep (timeline repost — PostPreviewCard already uses `bg-muted`)
            // needs `bg-accent` to stay distinct.
            isPreview && !coverImage && (contrast === 'strong' ? 'bg-accent' : 'bg-muted'),
          )}
        >
          {coverImage && (
            <Container
              overrideDefaults
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.7), rgba(0,0,0,0.35)), url(${coverImage})`,
              }}
            />
          )}

          <CardContent className="flex h-full flex-col gap-3 p-6">
            {/* Header row: icon + title + item-count (left, grows) | avatar (right) */}
            <Container overrideDefaults className="flex w-full flex-wrap items-center gap-3 sm:flex-nowrap">
              <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
                <Library className="size-6 shrink-0 text-foreground" />
                <Typography
                  as="span"
                  overrideDefaults
                  className="min-w-0 truncate text-xl leading-7 font-bold text-foreground"
                >
                  {title}
                </Typography>
                <CollectionCountBadge count={itemCount} onCover={!!coverImage} />
              </Container>

              <Container overrideDefaults className="flex shrink-0 items-center justify-end">
                <AvatarWithFallback
                  avatarUrl={ownerAvatarUrl}
                  name={ownerName}
                  fallbackSeed={authorPubky}
                  size="sm"
                  alt={ownerName}
                />
              </Container>
            </Container>

            {/* Description */}
            {description && (
              <Typography
                overrideDefaults
                className="line-clamp-2 w-full min-w-0 text-base leading-6 font-medium wrap-anywhere text-muted-foreground"
              >
                {description}
              </Typography>
            )}

            {/* Bottom row: tags (left, grows) | action button (right).
              Hidden in `preview` so embedded collections (repost dialog, repost
              previews) match how normal reposts render — no inline tags, no
              actions on the previewed post. */}
            {!isPreview && (
              <Container
                overrideDefaults
                data-cy="collection-card-bottom-row"
                className="mt-auto flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
              >
                <PostTagsExpandableRow
                  postId={compositeId}
                  preventDefaultOnClick
                  expanded={tagsExpanded}
                  onExpandedChange={setTagsExpanded}
                  showTagToggle={false}
                  // Full mode keeps the expanded tag UI from being squeezed on
                  // mobile collection cards. It also preserves PostTagsPanel's
                  // existing "See all" behavior when there are more than 3 tags.
                  panelWidthMode="full"
                  className="w-full min-w-0 sm:w-auto sm:flex-1"
                />
                <Container
                  overrideDefaults
                  data-cy="collection-card-tag-actions"
                  className="flex shrink-0 items-center gap-2 self-start sm:self-end"
                  onClick={suppressCardNavigation}
                  onAuxClick={suppressCardNavigation}
                >
                  <PostTagToggleButton
                    postId={compositeId}
                    expanded={tagsExpanded}
                    onToggle={handleTagToggle}
                    disabled={isOwn && isDeleting}
                  />
                  {isOwn ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      aria-label={t('delete')}
                      className="gap-2 text-xs"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleFollowToggle}
                      disabled={isToggling}
                      aria-label={isBookmarked ? t('unfollow') : t('follow')}
                      className="gap-2 text-xs"
                    >
                      {isBookmarked ? <Minus className="size-4" /> : <Plus className="size-4" />}
                      {isBookmarked ? t('unfollow') : t('follow')}
                    </Button>
                  )}
                </Container>
              </Container>
            )}
          </CardContent>
        </Card>
      </Link>
      <DialogConfirmDelete
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleDeleteConfirm}
        i18nNamespace="dialogs.deleteCollection"
        description={deleteCollectionDescription}
      />
    </>
  );
}
