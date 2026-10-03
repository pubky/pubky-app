'use client';

import { useParams } from 'next/navigation';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useCustomStreamId } from '@/hooks/useCustomStreamId/useCustomStreamId';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useHotStreamId } from '@/hooks/useHotStreamId/useHotStreamId';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useProfilePostsFilter } from '@/hooks/useProfilePostsFilter/useProfilePostsFilter';
import { useSearchStreamId } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { useStreamIdFromFilters } from '@/hooks/useStreamIdFromFilters/useStreamIdFromFilters';
import { useSyncInteractiveVisualContent } from '@/hooks/useSyncInteractiveVisualContent/useSyncInteractiveVisualContent';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { collectionItemsToPostIds, sortPostIdsByMembership } from '@/libs/post/collectionItemOrder';
import { buildCompositeId } from '@/models/models.utils';
import {
  type AuthorStreamCompositeId,
  buildAuthorCollectionsStreamId,
  buildCollectionItemsStreamId,
  buildContentSearchStreamId,
  PostStreamTypes,
} from '@/models/stream/post/postStream.types';
import { CollectionsEmpty } from '@/molecules/CollectionsEmpty/CollectionsEmpty';
import { FilterPostsBar } from '@/molecules/FilterPostsBar/FilterPostsBar';
import { FilterPostsEmpty } from '@/molecules/FilterPostsEmpty/FilterPostsEmpty';
import { PostsEmpty } from '@/molecules/PostsEmpty/PostsEmpty';
import { TimelineLoading } from '@/molecules/Timeline/TimelineLoading';
import { getTagsLayoutForSurfaceLayout } from '@/organisms/PostMain/PostMainLayoutRules';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { TimelineFeedWithStream } from '../TimelineFeedContent/TimelineFeedContent';
import type { HomeTimelineFeedProps, TimelineFeedProps } from './TimelineFeed.types';
import { resolveVisualFeedContent } from './TimelineFeedVisual.helpers';

export { useTimelineFeedContext } from './TimelineFeedContext';

/**
 * TimelineFeed
 *
 * Organism that encapsulates stream calculation and pagination logic.
 * Routes to variant-specific wrappers so each only subscribes to its own data sources.
 */
export function TimelineFeed(props: TimelineFeedProps) {
  switch (props.variant) {
    case TIMELINE_FEED_VARIANT.HOME:
      return <HomeTimelineFeed persistentHeader={props.persistentHeader}>{props.children}</HomeTimelineFeed>;
    case TIMELINE_FEED_VARIANT.CUSTOM:
      return <CustomTimelineFeed>{props.children}</CustomTimelineFeed>;
    case TIMELINE_FEED_VARIANT.BOOKMARKS:
      return (
        <BookmarksTimelineFeed
          emptyState={props.emptyState}
          trailingSlot={props.trailingSlot}
          requestedLayout={props.requestedLayout}
        >
          {props.children}
        </BookmarksTimelineFeed>
      );
    case TIMELINE_FEED_VARIANT.PROFILE:
      return <ProfileTimelineFeed>{props.children}</ProfileTimelineFeed>;
    case TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS:
      return <ProfileCollectionsTimelineFeed>{props.children}</ProfileCollectionsTimelineFeed>;
    case TIMELINE_FEED_VARIANT.HOT:
      return <HotTimelineFeed>{props.children}</HotTimelineFeed>;
    case TIMELINE_FEED_VARIANT.SEARCH:
      return <SearchTimelineFeed>{props.children}</SearchTimelineFeed>;
    case TIMELINE_FEED_VARIANT.COLLECTION:
      return (
        <CollectionTimelineFeed
          emptyState={props.emptyState}
          pullToRefreshContainerRef={props.pullToRefreshContainerRef}
          trailingSlot={props.trailingSlot}
          requestedLayout={props.requestedLayout}
          visualHiddenItemsNotice={props.visualHiddenItemsNotice}
        >
          {props.children}
        </CollectionTimelineFeed>
      );
    default:
      return <TimelineLoading />;
  }
}

function HomeTimelineFeed({
  children,
  persistentHeader,
}: {
  children?: HomeTimelineFeedProps['children'];
  persistentHeader?: HomeTimelineFeedProps['persistentHeader'];
}) {
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
      persistentHeader={persistentHeader}
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
  requestedLayout,
}: {
  children?: TimelineFeedProps['children'];
  requestedLayout?: Extract<TimelineFeedProps, { variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS }>['requestedLayout'];
  emptyState?: Extract<TimelineFeedProps, { variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS }>['emptyState'];
  trailingSlot?: Extract<TimelineFeedProps, { variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS }>['trailingSlot'];
}) {
  // Keep the library independent of Home filters and persisted layout preferences.
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.BOOKMARKS, requestedLayout ?? LAYOUT.CARDS);
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
  const { inputValue, onInputChange, activeQuery, validationMessage } = useProfilePostsFilter();
  // An active query swaps the stream to the author-scoped content search;
  // the bar stays mounted across the swap (it renders as feed children), so
  // input focus survives the results changing underneath it.
  const streamId = !pubky
    ? undefined
    : activeQuery
      ? buildContentSearchStreamId(activeQuery, 'all', pubky)
      : (`${StreamSource.AUTHOR}:${pubky}` as AuthorStreamCompositeId);
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.PROFILE);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.PROFILE}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
      emptyState={activeQuery ? <FilterPostsEmpty /> : <PostsEmpty />}
    >
      <FilterPostsBar value={inputValue} onValueChange={onInputChange} validationMessage={validationMessage} />
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
      emptyState={<CollectionsEmpty />}
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
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.COLLECTION, requestedLayout ?? LAYOUT.CARDS);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  // The envelope's `items` (a live Dexie query) is the local-first source of
  // truth for membership and ordering; the Nexus `collection` stream re-indexes
  // asynchronously and may still be empty right after a local save.
  const { postDetails, isLoading: isCollectionLoading } = usePostDetails(collectionId);
  const envelopeItems =
    postDetails === undefined || isCollectionLoading
      ? undefined
      : (parseCollectionContent(postDetails?.content ?? '')?.items ?? []);
  const membershipPostIds = collectionItemsToPostIds(envelopeItems);

  // Scope transient picker/removal state to both the collection and its viewer.
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

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
      transformPostIds={(postIds) => sortPostIdsByMembership(postIds, membershipPostIds)}
      membershipPostIds={membershipPostIds}
      key={`${streamId}:${currentUserPubky ?? 'guest'}`}
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
