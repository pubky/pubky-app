'use client';

import { useBookmarksStreamId } from '@/hooks/useBookmarksStreamId/useBookmarksStreamId';
import { useCustomStreamId } from '@/hooks/useCustomStreamId/useCustomStreamId';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useHotStreamId } from '@/hooks/useHotStreamId/useHotStreamId';
import { useSearchStreamId } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { useStreamIdFromFilters } from '@/hooks/useStreamIdFromFilters/useStreamIdFromFilters';
import { useSyncInteractiveVisualContent } from '@/hooks/useSyncInteractiveVisualContent/useSyncInteractiveVisualContent';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { TimelineLoading } from '@/molecules/Timeline/TimelineLoading';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { getTagsLayoutForSurfaceLayout } from '@/organisms/PostMain/PostMainLayout';
import type { TimelineFeedProps } from './TimelineFeed.types';
import { resolveVisualFeedContent } from './TimelineFeedVisual.helpers';
import { TimelineFeedWithStream } from '../TimelineFeedContent/TimelineFeedContent';

import type { AuthorStreamCompositeId } from '@/models/stream/post/postStream.types';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { useHomeStore } from '@/stores/home/home.store';
export { useTimelineFeedContext } from './TimelineFeedContext';

/**
 * TimelineFeed
 *
 * Organism that encapsulates stream calculation and pagination logic.
 * Routes to variant-specific wrappers so each only subscribes to its own data sources.
 */
export function TimelineFeed({ variant, children }: TimelineFeedProps) {
  switch (variant) {
    case TIMELINE_FEED_VARIANT.HOME:
      return <HomeTimelineFeed>{children}</HomeTimelineFeed>;
    case TIMELINE_FEED_VARIANT.CUSTOM:
      return <CustomTimelineFeed>{children}</CustomTimelineFeed>;
    case TIMELINE_FEED_VARIANT.BOOKMARKS:
      return <BookmarksTimelineFeed>{children}</BookmarksTimelineFeed>;
    case TIMELINE_FEED_VARIANT.PROFILE:
      return <ProfileTimelineFeed>{children}</ProfileTimelineFeed>;
    case TIMELINE_FEED_VARIANT.HOT:
      return <HotTimelineFeed>{children}</HotTimelineFeed>;
    case TIMELINE_FEED_VARIANT.SEARCH:
      return <SearchTimelineFeed>{children}</SearchTimelineFeed>;
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

function BookmarksTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const content = useHomeStore((state) => state.content);
  const layoutResolution = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.BOOKMARKS);
  const resolvedContent = resolveVisualFeedContent({
    content,
    variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
    isVisualActive: layoutResolution.isVisualActive,
  });
  useSyncInteractiveVisualContent(resolvedContent);
  const streamId = useBookmarksStreamId(resolvedContent);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layoutResolution.effectiveLayout);

  return (
    <TimelineFeedWithStream
      streamId={streamId}
      variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
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
