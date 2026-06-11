'use client';

import { Minus, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TagKind } from '@/application/tag/tag.types';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { parseCollectionContent, resolveCollectionCoverImage } from '@/libs/post/collectionContent';
import { cn } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { CollectionCountBadge } from '@/molecules/CollectionCountBadge/CollectionCountBadge';
import { ClickableTagsList } from '@/organisms/ClickableTagsList/ClickableTagsList';
import { CollectionHeroSkeleton } from '@/organisms/CollectionHero/CollectionHero.skeleton';
import { HeroOwner } from '@/organisms/HeroOwner/HeroOwner';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useAuthStore } from '@/stores/auth/auth.store';
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
  // The hero requests the higher-fidelity MAIN variant (the card uses FEED).
  const coverImage = resolveCollectionCoverImage(collection?.cover_image, FileVariant.MAIN);

  const ownerName = ownerProfile?.name || authorPubky;
  const ownerAvatarUrl = ownerProfile?.avatarUrl;

  // Override the generic bookmark toast copy so Follow / Unfollow reads as a
  // collection action, with the name interpolated (matches `CollectionCard`).
  const toastName = title || authorPubky;
  const { isBookmarked, isToggling, toggle } = useBookmark(compositeId, {
    toastMessages: {
      added: tCardToast('followed'),
      addedDesc: tCardToast('followedDesc', { name: toastName }),
      removed: tCardToast('unfollowed'),
      removedDesc: tCardToast('unfollowedDesc', { name: toastName }),
    },
  });

  const handleFollowToggle = () => {
    if (isToggling) return;
    void toggle();
  };

  // Sharing a collection = reposting the underlying post; reuse the standard dialog.
  const { openRepostDialog, dialogs } = usePostReplyRepostDialogs(compositeId);
  const handleShare = openRepostDialog;

  // Placeholder actions — the flows themselves are out of scope this slice.
  // TODO: wire in collection edit / delete (#1866 follow-ups).
  const handleEdit = () => {};
  const handleDelete = () => {};

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
              <Button
                variant="secondary"
                size="sm"
                onClick={handleEdit}
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
    </Card>
  );
}
