'use client';

import { Library } from 'lucide-react';
import { getCollectionRoute } from '@/app/routes';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { resolveCollectionCoverImage } from '@/libs/post/collectionCoverImage';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { CollectionCountBadge } from '@/molecules/CollectionCountBadge/CollectionCountBadge';
import { CollectionDeleted } from '@/molecules/CollectionDeleted/CollectionDeleted';
import { CollectionMissing } from '@/molecules/CollectionMissing/CollectionMissing';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { CollectionCardSkeleton } from '@/organisms/Collections/CollectionCard/CollectionCard.skeleton';
import { CollectionCardBlurred } from '@/organisms/Collections/CollectionCard/CollectionCardBlurred';
import { PostTagsExpandableRow } from '@/organisms/PostTagsExpandableRow/PostTagsExpandableRow';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

type CollectionCardPresentation = 'landing' | 'embed';

interface CollectionCardProps {
  /** Collection owner pubky. */
  authorPubky: Pubky;
  /** Collection post id (raw, not composite). */
  postId: string;
  className?: string;
  /**
   * Controls layout and embed chrome.
   *
   * - `landing` — full card in catalog sections and collection feeds (default)
   * - `embed` — nested preview (repost, share dialog, inline in post body)
   */
  presentation?: CollectionCardPresentation;
  /**
   * When `false`, tags render read-only. Use for collection embeds inside
   * share/repost dialogs; feed embeds keep the default (`true`).
   */
  interactiveActions?: boolean;
}

/**
 * CollectionCard
 *
 * Renders a single collection (a `kind=Collection` post) for the Collections
 * landing sections (`presentation="landing"`) and nested embed surfaces
 * (`presentation="embed"` — repost, share dialog, inline post body).
 * Use `interactiveActions={false}` on dialog embeds so tags stay visible but
 * non-interactive. Card-level collection actions live on the dedicated page header.
 * Self-contained: derives title / description / cover / item count / owner profile / tags
 * locally from `(authorPubky, postId)`, so callers stay thin.
 *
 * Two-stage render: while `usePostDetails` is resolving (`undefined`) we
 * render `CollectionCardSkeleton` so the card never flashes a half-empty
 * state (title='', itemCount=0, etc.). Once details land we delegate to
 * `CollectionCardContent` with `postDetails` as a non-null prop. The
 * separation also keeps hook ordering clean for hooks that depend on the loaded envelope.
 */
export function CollectionCard({
  authorPubky,
  postId,
  className,
  presentation = 'landing',
  interactiveActions = true,
}: CollectionCardProps) {
  const compositeId = buildCompositeId({ pubky: authorPubky, id: postId });
  const isMobile = useIsMobile();
  const isWideLayout = useEffectiveTagsLayout() === 'side';
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
      presentation={presentation}
      isMobile={isMobile}
      isWideLayout={isWideLayout}
      interactiveActions={interactiveActions}
    />
  );
}

interface CollectionCardContentProps {
  authorPubky: Pubky;
  postId: string;
  compositeId: string;
  postDetails: EnrichedPostDetails;
  className?: string;
  presentation: CollectionCardPresentation;
  isMobile: boolean;
  isWideLayout: boolean;
  interactiveActions: boolean;
}

function CollectionCardContent({
  authorPubky,
  postId,
  compositeId,
  postDetails,
  className,
  presentation,
  isMobile,
  isWideLayout,
  interactiveActions,
}: CollectionCardContentProps) {
  const isEmbed = presentation === 'embed';
  const showTagAddButton = interactiveActions && !isEmbed;
  const { profile: ownerProfile } = useUserProfile(authorPubky);

  const collection = parseCollectionContent(postDetails.content);

  const title = collection?.name ?? '';

  const description = collection?.description?.trim() ?? '';
  const itemCount = collection?.items?.length ?? 0;

  // Prefer a recently-uploaded blob URL stashed in the local-files store so the
  // cover renders instantly after create/edit while the CDN catches up.
  const localCoverUrl = useLocalFilesStore((s) => s.collections[compositeId]);
  const coverImage = localCoverUrl ?? resolveCollectionCoverImage(collection?.cover_image);
  // Elevated count pill contrast for embed chrome without a cover.
  const embeddedOnMuted = isEmbed && !coverImage;

  const ownerName = ownerProfile?.name || authorPubky;
  const ownerAvatarUrl = ownerProfile?.avatarUrl;

  const href = getCollectionRoute(authorPubky, postId);

  return (
    <Link
      overrideDefaults
      href={href}
      aria-label={title}
      data-cy="collection-card"
      data-presentation={presentation}
      data-interactive-actions={interactiveActions ? 'true' : 'false'}
      data-layout={isWideLayout ? 'wide' : 'default'}
      className={cn('group relative block h-full w-full', isEmbed && 'overflow-hidden rounded-md', className)}
    >
      <Card
        className={cn(
          // `isolate` creates a new stacking context so the cover image at `-z-10`
          // stays behind this card's content but does not slip behind an enclosing
          // post card's opaque background when nested in `PostContentBase`.
          // In preview embeds the Link wrapper owns clip + radius so a square
          // ancestor (quoted post shell) does not fight the cover at the corners.
          'relative isolate h-full gap-0 overflow-hidden py-0',
          isEmbed ? 'rounded-none shadow-none' : 'rounded-md',
          coverImage && 'border-transparent bg-card/40',
          // Embed without a cover uses `bg-muted` (Figma embed chrome).
          // With a cover, `bg-card/40` + the gradient overlay handle contrast.
          isEmbed && !coverImage && 'bg-muted',
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

        <CardContent className={cn('flex h-full flex-col gap-3', isWideLayout ? 'p-12' : 'p-6')}>
          {/* Mobile: title row, then metadata. Desktop: title (left) | metadata (right). */}
          <Container
            overrideDefaults
            data-cy="collection-card-header"
            className="flex w-full flex-col items-start gap-3 lg:flex-row lg:items-center"
          >
            <Container overrideDefaults className="flex w-full min-w-0 items-center gap-2 lg:flex-1">
              <Library className="size-6 shrink-0 text-foreground" />
              <Typography
                as="span"
                overrideDefaults
                className={cn(
                  'min-w-0 truncate font-bold text-foreground',
                  isWideLayout ? 'text-2xl leading-8' : 'text-xl leading-7',
                )}
              >
                {title}
              </Typography>
            </Container>

            <Container overrideDefaults data-cy="collection-card-metadata" className="flex shrink-0 items-center gap-2">
              <CollectionCountBadge
                count={itemCount}
                showLabelOnMobile
                tone={embeddedOnMuted ? 'on-muted' : 'on-card'}
              />
              <AvatarWithFallback
                avatarUrl={ownerAvatarUrl}
                name={ownerName}
                fallbackSeed={authorPubky}
                size={isWideLayout ? 'lg' : 'sm'}
                alt={ownerName}
              />
            </Container>
          </Container>

          {/* Description */}
          {description && (
            <Typography
              overrideDefaults
              className="line-clamp-2 w-full min-w-0 text-base leading-6 font-medium wrap-anywhere text-secondary-foreground"
            >
              {description}
            </Typography>
          )}

          {/* Tags stay visible but read-only in non-interactive share/repost previews. */}
          <Container overrideDefaults data-cy="collection-card-bottom-row" className="mt-auto w-full">
            <PostTagsExpandableRow
              postId={compositeId}
              preventDefaultOnClick
              showTagToggle={false}
              showAddButton={showTagAddButton}
              tagsReadOnly={!interactiveActions}
              maxVisibleTags={isMobile ? 3 : undefined}
              className="w-full min-w-0"
            />
          </Container>
        </CardContent>
      </Card>
    </Link>
  );
}
