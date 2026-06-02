'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { COLLECTIONS_MY_SECTION_SKELETON_COUNT, COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { AvatarStackSkeleton } from '@/molecules/AvatarStack/AvatarStack.skeleton';
import { useToast } from '@/molecules/Toaster/use-toast';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { CollectionBookmarkCard } from '@/organisms/Collections/CollectionBookmarkCard/CollectionBookmarkCard';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { CollectionCardSkeleton } from '@/organisms/Collections/CollectionCard/CollectionCard.skeleton';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

/**
 * MyCollections
 *
 * "My Collections" section on `/collections`. Renders:
 *   1. A pinned `CollectionBookmarkCard` (always first, represents the
 *      user's legacy bookmark feed).
 *   2. The current user's `kind=Collection` posts, paginated via the
 *      `<pubky>:author:collection` stream id.
 *
 * Pagination = "Show more" button (no infinite scroll on the landing).
 * No empty state — the pinned card is always present.
 */
export function MyCollections() {
  const t = useTranslations('collections');

  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const localAvatarUrl = useLocalFilesStore((state) => state.profile);

  const avatarUrl =
    localAvatarUrl ??
    (currentUserPubky && userDetails?.image
      ? FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
      : undefined);
  const avatarName = userDetails?.name || 'U';
  const avatarSeed = currentUserPubky ?? avatarName;

  return (
    <Container overrideDefaults className="flex w-full flex-col gap-4">
      {/* Header */}
      <Container overrideDefaults className="flex items-center gap-3">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {t('my.title')}
        </Heading>
        {currentUserPubky ? (
          <AvatarWithFallback
            avatarUrl={avatarUrl}
            name={avatarName}
            fallbackSeed={avatarSeed}
            size="md"
            alt={avatarName}
          />
        ) : (
          <AvatarStackSkeleton count={1} size="md" />
        )}
      </Container>

      {/* Body */}
      {currentUserPubky ? (
        <MyCollectionsStream currentUserPubky={currentUserPubky as Pubky} />
      ) : (
        <Container overrideDefaults className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <CollectionBookmarkCard />
        </Container>
      )}
    </Container>
  );
}

interface MyCollectionsStreamProps {
  currentUserPubky: Pubky;
}

/**
 * Inner data-driven body — only mounted when we have an authenticated user,
 * so `useStreamPagination` always receives a real stream id.
 */
function MyCollectionsStream({ currentUserPubky }: MyCollectionsStreamProps) {
  const t = useTranslations('collections');
  const tToast = useTranslations('toast');
  const { toast } = useToast();
  const streamId = buildAuthorCollectionsStreamId(currentUserPubky);

  const { postIds, hasMore, loadMore, loading, loadingMore } = useStreamPagination({
    streamId,
    limit: COLLECTIONS_SECTION_PAGE_SIZE,
    // Surface fetch failures to the user. Sibling sections (`FollowedCollections`,
    // `DiscoverCollections`) bypass `useStreamPagination` and fire the same
    // toast inline from their catch blocks — keeping the failure UX consistent
    // across all three sections of the Collections landing.
    onError: () => {
      toast({
        title: tToast('error'),
        description: t('loadFailed'),
      });
    },
  });

  const showShowMore = hasMore && !loading;
  // Only show skeleton placeholders when we have nothing to render yet, so
  // warm-cache loads don't flash a skeleton next to the pinned card.
  const showSkeletons = loading && postIds.length === 0;

  return (
    <>
      <Container overrideDefaults className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <CollectionBookmarkCard />
        {showSkeletons
          ? Array.from({ length: COLLECTIONS_MY_SECTION_SKELETON_COUNT }).map((_, index) => (
              <CollectionCardSkeleton key={`my-collections-skeleton-${index}`} />
            ))
          : postIds.map((compositeId) => {
              const { pubky, id } = parseCompositeId(compositeId);
              return <CollectionCard key={compositeId} authorPubky={pubky} postId={id} />;
            })}
      </Container>

      {showShowMore && (
        <Container overrideDefaults className="flex w-full justify-center">
          <Button variant="default" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            {t('showMore')}
          </Button>
        </Container>
      )}
    </>
  );
}
