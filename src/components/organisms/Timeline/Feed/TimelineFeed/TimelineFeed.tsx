'use client';

import { useParams } from 'next/navigation';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useCustomStreamId } from '@/hooks/useCustomStreamId/useCustomStreamId';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useHotStreamId } from '@/hooks/useHotStreamId/useHotStreamId';
import { useSearchStreamId } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { useStreamIdFromFilters } from '@/hooks/useStreamIdFromFilters/useStreamIdFromFilters';
import { useSyncInteractiveVisualContent } from '@/hooks/useSyncInteractiveVisualContent/useSyncInteractiveVisualContent';
import { buildCompositeId } from '@/models/models.utils';
import {
  type AuthorStreamCompositeId,
  buildAuthorCollectionsStreamId,
  buildCollectionItemsStreamId,
  PostStreamTypes,
} from '@/models/stream/post/postStream.types';
import { TimelineLoading } from '@/molecules/Timeline/TimelineLoading';
import { getTagsLayoutForSurfaceLayout } from '@/organisms/PostMain/PostMainLayoutRules';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { TimelineFeedWithStream } from '../TimelineFeedContent/TimelineFeedContent';
import type { TimelineFeedProps } from './TimelineFeed.types';
import { resolveVisualFeedContent } from './TimelineFeedVisual.helpers';

export { useTimelineFeedContext } from './TimelineFeedContext';

/**
 * TimelineFeed
 *
 * Organism that encapsulates stream calculation and pagination logic.
 * Routes to variant-specific wrappers so each only subscribes to its own data sources.
 */
export function TimelineFeed({
  variant,
  children,
  emptyState,
  pullToRefreshContainerRef,
  trailingSlot,
  requestedLayout,
  visualHiddenItemsNotice,
}: TimelineFeedProps) {
  switch (variant) {
    case TIMELINE_FEED_VARIANT.HOME:
      return <HomeTimelineFeed>{children}</HomeTimelineFeed>;
    case TIMELINE_FEED_VARIANT.CUSTOM:
      return <CustomTimelineFeed>{children}</CustomTimelineFeed>;
    case TIMELINE_FEED_VARIANT.BOOKMARKS:
      return (
        <BookmarksTimelineFeed emptyState={emptyState} trailingSlot={trailingSlot}>
          {children}
        </BookmarksTimelineFeed>
      );
    case TIMELINE_FEED_VARIANT.PROFILE:
      return <ProfileTimelineFeed>{children}</ProfileTimelineFeed>;
    case TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS:
      return <ProfileCollectionsTimelineFeed>{children}</ProfileCollectionsTimelineFeed>;
    case TIMELINE_FEED_VARIANT.HOT:
      return <HotTimelineFeed>{children}</HotTimelineFeed>;
    case TIMELINE_FEED_VARIANT.SEARCH:
      return <SearchTimelineFeed>{children}</SearchTimelineFeed>;
    case TIMELINE_FEED_VARIANT.COLLECTION:
      return (
        <CollectionTimelineFeed
          emptyState={emptyState}
          pullToRefreshContainerRef={pullToRefreshContainerRef}
          trailingSlot={trailingSlot}
          requestedLayout={requestedLayout}
          visualHiddenItemsNotice={visualHiddenItemsNotice}
        >
          {children}
        </CollectionTimelineFeed>
      );
    default:
      return <TimelineLoading />;
  }
}

function HomeTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const content = useHomeStore((state) => state.content);
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.HOME);
  const resolvedContent = resolveVisualFeedContent({
    content,
    variant: TIMELINE_FEED_VARIANT.HOME,
    isVisualActive: layoutResolution.isVisualActive,
  });
  useSyncInteractiveVisualContent(resolvedContent);
  const streamId = useStreamIdFromFilters(resolvedContent);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.HOME}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
    >
      {children}
    </TimelineFeedWithStream>
  );
}

function CustomTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const streamId = useCustomStreamId();
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.CUSTOM);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.CUSTOM}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
    >
      {children}
    </TimelineFeedWithStream>
  );
}

function BookmarksTimelineFeed({
  children,
  emptyState,
  trailingSlot,
}: {
  children?: TimelineFeedProps['children'];
  emptyState?: Extract<TimelineFeedProps, { variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS }>['emptyState'];
  trailingSlot?: Extract<TimelineFeedProps, { variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS }>['trailingSlot'];
}) {
  // The bookmarks route exposes no filter UI and shows collections in their own
  // section below, so the feed is always the fixed all-bookmarks stream. It must
  // not react to the shared home-store content/sort filters. Layout is pinned to
  // columns (BOOKMARKS is excluded from RICH_LAYOUT_SUPPORTED_FEED_VARIANTS), so
  // tags are always inline — mirroring the sibling single-collection grid feed.
  // `layoutResolution` is still required: it carries `isGridActive` for the grid.
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.BOOKMARKS);
  const streamId = PostStreamTypes.TIMELINE_BOOKMARKS_ALL;

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
      tagsLayout="inline"
      layoutResolution={layoutResolution}
      emptyState={emptyState}
      trailingSlot={trailingSlot}
    >
      {children}
    </TimelineFeedWithStream>
  );
}

function ProfileTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const { pubky } = useProfileContext();
  const streamId = pubky ? (`${StreamSource.AUTHOR}:${pubky}` as AuthorStreamCompositeId) : undefined;
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.PROFILE);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.PROFILE}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
    >
      {children}
    </TimelineFeedWithStream>
  );
}

function ProfileCollectionsTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const { pubky } = useProfileContext();
  const streamId = pubky ? buildAuthorCollectionsStreamId(pubky) : undefined;
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
    >
      {children}
    </TimelineFeedWithStream>
  );
}

function CollectionTimelineFeed({
  children,
  emptyState,
  pullToRefreshContainerRef,
  trailingSlot,
  requestedLayout,
  visualHiddenItemsNotice,
}: {
  children?: TimelineFeedProps['children'];
  emptyState?: Extract<TimelineFeedProps, { variant: typeof TIMELINE_FEED_VARIANT.COLLECTION }>['emptyState'];
  pullToRefreshContainerRef?: Extract<
    TimelineFeedProps,
    { variant: typeof TIMELINE_FEED_VARIANT.COLLECTION }
  >['pullToRefreshContainerRef'];
  trailingSlot?: Extract<TimelineFeedProps, { variant: typeof TIMELINE_FEED_VARIANT.COLLECTION }>['trailingSlot'];
  requestedLayout: Extract<TimelineFeedProps, { variant: typeof TIMELINE_FEED_VARIANT.COLLECTION }>['requestedLayout'];
  visualHiddenItemsNotice?: Extract<
    TimelineFeedProps,
    { variant: typeof TIMELINE_FEED_VARIANT.COLLECTION }
  >['visualHiddenItemsNotice'];
}) {
  // The single-collection route owns these params (`/collections/[userId]/[postId]`).
  // Reading them here mirrors how `ProfileTimelineFeed` resolves its stream from context.
  const params = useParams<{ userId: string; postId: string }>();
  const userId = params?.userId;
  const postId = params?.postId;
  const streamId = userId && postId ? buildCollectionItemsStreamId(userId, postId) : undefined;
  const collectionId = userId && postId ? buildCompositeId({ pubky: userId, id: postId }) : undefined;
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.COLLECTION, requestedLayout ?? LAYOUT.COLUMNS);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.COLLECTION}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
      emptyState={emptyState}
      collectionId={collectionId}
      pullToRefreshContainerRef={pullToRefreshContainerRef}
      trailingSlot={trailingSlot}
      visualHiddenItemsNotice={visualHiddenItemsNotice}
    >
      {children}
    </TimelineFeedWithStream>
  );
}

function HotTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const streamId = useHotStreamId();
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.HOT);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.HOT}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
    >
      {children}
    </TimelineFeedWithStream>
  );
}

function SearchTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const content = useHomeStore((state) => state.content);
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.SEARCH);
  const resolvedContent = resolveVisualFeedContent({
    content,
    variant: TIMELINE_FEED_VARIANT.SEARCH,
    isVisualActive: layoutResolution.isVisualActive,
  });
  useSyncInteractiveVisualContent(resolvedContent);
  const streamId = useSearchStreamId(resolvedContent);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.SEARCH}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
    >
      {children}
    </TimelineFeedWithStream>
  );
}
