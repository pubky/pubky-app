'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
import { TagKind } from '@/application/tag/tag.types';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { useDeletePost } from '@/hooks/useDeletePost/useDeletePost';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { parseCollectionContent, resolveCollectionCoverImage } from '@/libs/post/collectionContent';
import { cn } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { CollectionCountBadge } from '@/molecules/CollectionCountBadge/CollectionCountBadge';
import { DialogConfirmDelete } from '@/molecules/DialogConfirmDelete/DialogConfirmDelete';
import { ClickableTagsList } from '@/organisms/ClickableTagsList/ClickableTagsList';
import { CollectionHeroSkeleton } from '@/organisms/Collections/CollectionHero/CollectionHero.skeleton';
import { EditCollectionDialog } from '@/organisms/EditCollectionDialog/EditCollectionDialog';
import { HeroOwner } from '@/organisms/HeroOwner/HeroOwner';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { CollectionHeroContentProps, CollectionHeroProps } from './CollectionHero.types';

/**
 * CollectionHero
 *
 * Top region of the single-collection view (`/collections/[userId]/[postId]`).
 * Mirrors `CollectionCard`'s two-stage data approach: while `usePostDetails`
 * resolves (`undefined`) we render `CollectionHeroSkeleton`; once the envelope
 * lands we delegate to `CollectionHeroContent` (which owns the hooks that read
 * the parsed envelope — `useBookmark` toast copy, etc.).
 *
 * The Hero → feed → Sections structure is identical for both owner and
 * other-user views; only the action buttons differ:
 *   - owner   → Share / Edit / Delete (visual placeholders this slice).
 *   - other   → real Follow / Unfollow (via `useBookmark`) + Share placeholder.
 */
export function CollectionHero({ authorPubky, postId, className }: CollectionHeroProps) {
  const compositeId = buildCompositeId({ pubky: authorPubky, id: postId });
  const { postDetails } = usePostDetails(compositeId);

  if (!postDetails) {
    return <CollectionHeroSkeleton className={className} />;
  }

  return (
    <CollectionHeroContent
      authorPubky={authorPubky}
      postId={postId}
      compositeId={compositeId}
      postDetails={postDetails}
      className={className}
    />
  );
}

function CollectionHeroContent({ authorPubky, compositeId, postDetails, className }: CollectionHeroContentProps) {
  const t = useTranslations('collections.single');
  const tCardToast = useTranslations('collections.card.toast');

  const { profile: ownerProfile } = useUserProfile(authorPubky);
  // Gate the owner name on the resolved profile so the hero doesn't flash the
  // raw pubky (the `|| authorPubky` fallback) before the name loads on refresh.
  const isOwnerResolved = ownerProfile != null;

  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isOwn = currentUserPubky === authorPubky;

  const collection = parseCollectionContent(postDetails.content);

  const title = collection?.name ?? '';
  const description = collection?.description?.trim() ?? '';
  const itemCount = collection?.items?.length ?? 0;

  // Prefer a recently-uploaded blob URL stashed in the local-files store —
  // covers the window between commit and CDN availability so the cover renders
  // instantly after create/edit. The hero requests the higher-fidelity MAIN
  // variant (the card uses FEED).
  const localCoverUrl = useLocalFilesStore((s) => s.collections[compositeId]);
  const coverImage = localCoverUrl ?? resolveCollectionCoverImage(collection?.cover_image, FileVariant.MAIN);

  const ownerName = ownerProfile?.name || authorPubky;
  const ownerAvatarUrl = ownerProfile?.avatarUrl;

  // Override the generic bookmark toast copy so Follow / Unfollow reads as a
  // collection action, with the name interpolated (matches `CollectionCard`).
  const toastName = title || authorPubky;
  const { isBookmarked, isToggling, toggle } = useBookmark(compositeId, {
    toastMessages: {
      added: tCardToast('followed', { name: toastName }),
      removed: tCardToast('unfollowed', { name: toastName }),
    },
  });

  const handleFollowToggle = () => {
    if (isToggling) return;
    void toggle();
  };

  // Sharing a collection = reposting the underlying post; reuse the standard dialog.
  const { openRepostDialog, dialogs } = usePostReplyRepostDialogs(compositeId);
  const handleShare = openRepostDialog;

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const handleEdit = () => setIsEditDialogOpen(true);

  // Delete flow: open confirmation → on confirm, await the commit before
  // redirecting to `/collections`. Awaiting matters: the local-first delete
  // write is async, and racing the redirect causes (a) stream queries on the
  // landing page to read stale state, and (b) for the soft-delete branch
  // (linked collections), the `[DELETED]` content marker only lands after
  // navigation, leaving the user able to navigate back to the still-rendered
  // hero and re-fire `commitDelete` (which then errors on the homeserver as
  // already-gone). `replace` so the back button doesn't return to the now-
  // deleted page. Collection-specific toast copy so the success / failure
  // toast reads as "Collection deleted" not "Post deleted".
  const router = useRouter();
  const tCollectionToast = useTranslations('toast.collection');
  const { deletePost, isDeleting } = useDeletePost({
    toastMessages: {
      deleted: tCollectionToast('collectionDeleted'),
      deleteFailed: tCollectionToast('deleteFailed'),
    },
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const handleDelete = () => setDeleteConfirmOpen(true);
  const handleDeleteConfirm = async () => {
    await deletePost(compositeId);
    router.replace(APP_ROUTES.COLLECTIONS);
  };

  return (
    <Card
      data-cy="collection-hero"
      className={cn(
        'relative gap-0 overflow-hidden rounded-md py-0',
        coverImage && 'border-transparent bg-card/40',
        className,
      )}
    >
      {coverImage && (
        <Container
          overrideDefaults
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0.2) 100%), url(${coverImage})`,
          }}
        />
      )}

      <CardContent className="flex flex-col justify-center gap-4 p-8 lg:p-12">
        {/* Title */}
        <Typography
          as="h1"
          overrideDefaults
          className="text-5xl leading-tight font-bold wrap-anywhere text-foreground lg:text-6xl"
        >
          {title}
        </Typography>

        {/* Owner + item count */}
        <Container overrideDefaults className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <HeroOwner
            name={ownerName}
            fallbackSeed={authorPubky}
            avatarUrl={ownerAvatarUrl}
            isResolved={isOwnerResolved}
            size="md"
            className="gap-2"
          />

          <CollectionCountBadge count={itemCount} />
        </Container>

        {/* Description */}
        {description && (
          <Typography
            overrideDefaults
            className="max-w-3xl text-xl leading-8 font-light wrap-anywhere text-muted-foreground lg:text-2xl"
          >
            {description}
          </Typography>
        )}

        {/* Tags */}
        <ClickableTagsList
          taggedId={compositeId}
          taggedKind={TagKind.POST}
          showCount={true}
          showInput={false}
          showAddButton={true}
          addMode={true}
        />

        {/* Actions */}
        <Container overrideDefaults className="flex flex-wrap items-center gap-3">
          {isOwn ? (
            <>
              {/* While a delete is in flight, disable every owner action.
                  Lets the user know something's happening and prevents racing
                  Share / Edit against an imminent route replace. */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleShare}
                disabled={isDeleting}
                aria-label={t('share')}
                className="gap-2 text-xs"
              >
                <Share2 className="size-4" />
                {t('share')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleEdit}
                disabled={isDeleting}
                aria-label={t('edit')}
                className="gap-2 text-xs"
              >
                <Pencil className="size-4" />
                {t('edit')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                aria-label={t('delete')}
                className="gap-2 text-xs"
              >
                <Trash2 className="size-4" />
                {t('delete')}
              </Button>
            </>
          ) : (
            <>
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
              <Button
                variant="secondary"
                size="sm"
                onClick={handleShare}
                aria-label={t('share')}
                className="gap-2 text-xs"
              >
                <Share2 className="size-4" />
                {t('share')}
              </Button>
            </>
          )}
        </Container>
      </CardContent>
      {dialogs}
      {isOwn && (
        <>
          <EditCollectionDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            compositeCollectionId={compositeId}
          />
          <DialogConfirmDelete
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
            onConfirm={() => void handleDeleteConfirm()}
            i18nNamespace="dialogs.deleteCollection"
          />
        </>
      )}
    </Card>
  );
}
