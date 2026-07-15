'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES, getUserProfileUrl } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { useDeletePost } from '@/hooks/useDeletePost/useDeletePost';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { parseCollectionContent, resolveCollectionCoverImage } from '@/libs/post/collectionContent';
import { cn } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { CollectionCountBadge } from '@/molecules/CollectionCountBadge/CollectionCountBadge';
import { DialogConfirmDelete } from '@/molecules/DialogConfirmDelete/DialogConfirmDelete';
import { CollectionHeroSkeleton } from '@/organisms/Collections/CollectionHero/CollectionHero.skeleton';
import { CollectionHeroBlurred } from '@/organisms/Collections/CollectionHero/CollectionHeroBlurred';
import { DialogAddContent } from '@/organisms/Collections/DialogAddContent/DialogAddContent';
import { DialogEditCollection } from '@/organisms/Collections/DialogEditCollection/DialogEditCollection';
import { HeroOwner } from '@/organisms/HeroOwner/HeroOwner';
import { PostTagsExpandableRow } from '@/organisms/PostTagsExpandableRow/PostTagsExpandableRow';
import { PostTagToggleButton } from '@/organisms/PostTagsExpandableRow/PostTagToggleButton';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { CollectionHeroContentProps, CollectionHeroProps } from './CollectionHero.types';

/**
 * CollectionHero
 *
 * Top region of the single-collection view (`/collections/[userId]/[postId]`).
 * While the shared `postDetails` envelope is still resolving (`undefined`) we
 * render `CollectionHeroSkeleton`; once the envelope lands we delegate to
 * `CollectionHeroContent` (which owns the hooks that read the parsed envelope
 * — `useBookmark` toast copy, etc.).
 *
 * The Hero → feed → Sections structure is identical for both owner and
 * other-user views; only the action buttons differ:
 *   - owner   → Content / Share / Edit / Delete.
 *   - other   → real Follow / Unfollow (via `useBookmark`) + Share placeholder.
 */
export function CollectionHero({ authorPubky, postId, postDetails, className }: CollectionHeroProps) {
  const compositeId = buildCompositeId({ pubky: authorPubky, id: postId });

  if (!postDetails) {
    return <CollectionHeroSkeleton className={className} />;
  }

  // Moderated collections render a blurred, same-footprint placeholder instead
  // of their content. Mirrors `PostContentBase`'s blur intercept; the single
  // collection page renders the hero directly so it needs its own check.
  if (postDetails.is_blurred) {
    return <CollectionHeroBlurred compositeId={compositeId} className={className} />;
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
  const { requireAuth } = useRequireAuth();

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
  const ownerProfileHref = getUserProfileUrl(authorPubky, currentUserPubky);

  // Override the generic bookmark toast copy so Follow / Unfollow reads as a
  // collection action (matches `CollectionCard`).
  const { isBookmarked, isToggling, toggle } = useBookmark(compositeId, {
    toastMessages: {
      added: tCardToast('followed'),
      removed: tCardToast('unfollowed'),
    },
  });

  const handleFollowToggle = () => {
    if (isToggling) return;
    requireAuth(() => {
      void toggle();
    });
  };

  // Sharing a collection = reposting the underlying post; reuse the standard
  // dialog but override its copy/icon so it reads as a collection share (title,
  // submit button matching the hero's Share button, success toast).
  const { openRepostDialog, dialogs } = usePostReplyRepostDialogs(compositeId, {
    title: t('shareTitle'),
    submitLabel: t('share'),
    submitIcon: StickyNote,
    successToastTitle: tCardToast('shared'),
  });
  const handleShare = () => {
    requireAuth(openRepostDialog);
  };

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
  const tDeleteCollection = useTranslations('dialogs.deleteCollection');
  const deleteCollectionDescription = tDeleteCollection('description', { name: title || authorPubky });
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
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const tagToggle = (
    <PostTagToggleButton
      postId={compositeId}
      expanded={tagsExpanded}
      onToggle={() => setTagsExpanded((prev) => !prev)}
      disabled={isOwn && isDeleting}
    />
  );

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

        {/* Owner + item count — mobile: count on the right; lg+: inline next to owner */}
        <Container overrideDefaults className="flex w-full items-center gap-3">
          <HeroOwner
            name={ownerName}
            fallbackSeed={authorPubky}
            avatarUrl={ownerAvatarUrl}
            isResolved={isOwnerResolved}
            size="md"
            className="min-w-0 flex-1 gap-2 lg:flex-none"
            profileHref={ownerProfileHref}
          />
          <CollectionCountBadge count={itemCount} />
        </Container>

        {/* Description */}
        {description && (
          <Typography
            overrideDefaults
            className="max-w-3xl text-xl leading-8 font-light wrap-anywhere text-secondary-foreground lg:text-2xl"
          >
            {description}
          </Typography>
        )}

        {/* Tags */}
        <PostTagsExpandableRow
          postId={compositeId}
          expanded={tagsExpanded}
          onExpandedChange={setTagsExpanded}
          showTagToggle={false}
        />

        {/* Actions */}
        <Container overrideDefaults className="flex flex-wrap items-center gap-3">
          {isOwn ? (
            <>
              <DialogAddContent
                target={{ type: 'collection', collectionId: compositeId }}
                dataCy="collection-add-content"
                disabled={isDeleting}
              />
              {/* While a delete is in flight, disable owner actions so the
                  user knows something is happening and those actions cannot race
                  an imminent route replace. */}
              <Button
                variant="secondary"
                size="icon"
                onClick={handleShare}
                disabled={isDeleting}
                aria-label={t('share')}
                className="lg:h-8 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-xs"
              >
                <StickyNote className="size-4" />
                <Typography as="span" overrideDefaults className="hidden lg:inline">
                  {t('share')}
                </Typography>
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={handleEdit}
                disabled={isDeleting}
                aria-label={t('edit')}
                className="lg:h-8 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-xs"
              >
                <Pencil className="size-4" />
                <Typography as="span" overrideDefaults className="hidden lg:inline">
                  {t('edit')}
                </Typography>
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={handleDelete}
                disabled={isDeleting}
                aria-label={t('delete')}
                className="lg:h-8 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-xs"
              >
                <Trash2 className="size-4" />
                <Typography as="span" overrideDefaults className="hidden lg:inline">
                  {t('delete')}
                </Typography>
              </Button>
              {tagToggle}
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
                size="icon"
                onClick={handleShare}
                aria-label={t('share')}
                className="lg:h-8 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-xs"
              >
                <StickyNote className="size-4" />
                <Typography as="span" overrideDefaults className="hidden lg:inline">
                  {t('share')}
                </Typography>
              </Button>
              {tagToggle}
            </>
          )}
        </Container>
      </CardContent>
      {dialogs}
      {isOwn && (
        <>
          <DialogEditCollection
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            compositeCollectionId={compositeId}
          />
          <DialogConfirmDelete
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
            onConfirm={() => void handleDeleteConfirm()}
            i18nNamespace="dialogs.deleteCollection"
            description={deleteCollectionDescription}
          />
        </>
      )}
    </Card>
  );
}
