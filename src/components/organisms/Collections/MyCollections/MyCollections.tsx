'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { COLLECTIONS_MY_SECTION_SKELETON_COUNT, COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { FileController } from '@/controllers/file/file';
import { PostController } from '@/controllers/post/post';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { isPostDeleted } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { AvatarStackSkeleton } from '@/molecules/AvatarStack/AvatarStack.skeleton';
import { useToast } from '@/molecules/Toaster/use-toast';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { CollectionBookmarkCard } from '@/organisms/Collections/CollectionBookmarkCard/CollectionBookmarkCard';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { CollectionCardSkeleton } from '@/organisms/Collections/CollectionCard/CollectionCard.skeleton';
import { DialogNewCollection } from '@/organisms/Collections/DialogNewCollection/DialogNewCollection';
import { NewCollectionCardCTA } from '@/organisms/Collections/NewCollectionCardCTA/NewCollectionCardCTA';
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
      <Container overrideDefaults className="flex flex-wrap items-center justify-between gap-3">
        <Container overrideDefaults className="flex flex-wrap items-center gap-3">
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
          <DialogNewCollection>
            <Button variant="secondary" size="sm">
              <Plus />
              <Typography as="span" overrideDefaults className="text-sm font-bold lg:hidden">
                {t('new.ctaShort')}
              </Typography>
              <Typography as="span" overrideDefaults className="hidden text-sm font-bold lg:inline">
                {t('new.ctaShort')}
              </Typography>
            </Button>
          </DialogNewCollection>
        </Container>
      </Container>

      {/* Body */}
      {currentUserPubky ? (
        <MyCollectionsStream currentUserPubky={currentUserPubky as Pubky} />
      ) : (
        <Container overrideDefaults className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-6">
          <CollectionBookmarkCard />
        </Container>
      )}
    </Container>
  );
}

const EMPTY_IDS: string[] = [];

interface MyCollectionsStreamProps {
  currentUserPubky: Pubky;
}

/**
 * Inner data-driven body — only mounted when we have an authenticated user,
 * so `useStreamPagination` always receives a real stream id.
 */
function MyCollectionsStream({ currentUserPubky }: MyCollectionsStreamProps) {
  const t = useTranslations('collections');
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
        variant: 'error',
        description: t('loadFailed'),
      });
    },
  });

  const showShowMore = hasMore && !loading;
  // Only show skeleton placeholders when we have nothing to render yet, so
  // warm-cache loads don't flash a skeleton next to the pinned card.
  const showSkeletons = loading && postIds.length === 0;

  // Filter out soft-deleted collections (content === '[DELETED]'). Soft delete
  // is the path taken whenever a collection has connections (bookmarks /
  // replies / reposts) — `LocalPostService.delete` flips `PostDetails.content`
  // to `[DELETED]` but leaves the id in the author's collection PostStream, so
  // a redirect from `CollectionHero` would otherwise re-mount this section
  // with the deleted id still present. The live query observes `post_details`
  // so the filter reacts the moment the soft-delete write lands. Falls back
  // to `EMPTY_IDS` while the query resolves — same pattern as
  // `FollowedCollections` so the section never paints unfiltered ids that
  // could briefly show `CollectionDeleted` molecules before the filter lands.
  const visibleIds =
    useLiveQuery(async () => {
      if (postIds.length === 0) return EMPTY_IDS;
      const details = await PostController.getDetailsByIds({ compositeIds: postIds });
      return postIds.filter((_, i) => {
        const detail = details[i];
        return !detail || !isPostDeleted(detail.content);
      });
    }, [postIds]) ?? EMPTY_IDS;

  return (
    <>
      <Container overrideDefaults className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-6">
        <CollectionBookmarkCard />
        {showSkeletons
          ? Array.from({ length: COLLECTIONS_MY_SECTION_SKELETON_COUNT }).map((_, index) => (
              <CollectionCardSkeleton key={`my-collections-skeleton-${index}`} />
            ))
          : visibleIds.map((compositeId) => {
              const { pubky, id } = parseCompositeId(compositeId);
              return <CollectionCard key={compositeId} authorPubky={pubky} postId={id} showDeleteAction />;
            })}
        <NewCollectionCardCTA />
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
