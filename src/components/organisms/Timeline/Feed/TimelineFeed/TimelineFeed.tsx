'use client';

import { TIMELINE_FEED_VARIANT } from '@/config';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import * as Providers from '@/providers';
import type { TagsLayout } from '../../../PostMain/PostMain.types';
import type { TimelineFeedProps } from './TimelineFeed.types';
import { resolveVisualFeedContent } from './TimelineFeedVisual.helpers';
import { TimelineFeedWithStream } from '../TimelineFeedContent';

export { useTimelineFeedContext } from './TimelineFeedContext';

function getTagsLayout(effectiveLayout: Core.LayoutType): TagsLayout {
  return effectiveLayout === Core.LAYOUT.WIDE ? 'side' : 'inline';
}

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
      return <Molecules.TimelineLoading />;
  }
}

function HomeTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const content = Core.useHomeStore((state) => state.content);
  const layoutResolution = Hooks.useFeedLayoutResolution(TIMELINE_FEED_VARIANT.HOME);
  const resolvedContent = resolveVisualFeedContent({
    content,
    variant: TIMELINE_FEED_VARIANT.HOME,
    isVisualActive: layoutResolution.isVisualActive,
  });
  Hooks.useSyncInteractiveVisualContent(resolvedContent);
  const streamId = Hooks.useStreamIdFromFilters(resolvedContent);
  const tagsLayout = getTagsLayout(layoutResolution.effectiveLayout);

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
  const streamId = Hooks.useCustomStreamId();
  const layoutResolution = Hooks.useFeedLayoutResolution(TIMELINE_FEED_VARIANT.CUSTOM);
  const tagsLayout = getTagsLayout(layoutResolution.effectiveLayout);

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
  const content = Core.useHomeStore((state) => state.content);
  const layoutResolution = Hooks.useFeedLayoutResolution(TIMELINE_FEED_VARIANT.BOOKMARKS);
  const resolvedContent = resolveVisualFeedContent({
    content,
    variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
    isVisualActive: layoutResolution.isVisualActive,
  });
  Hooks.useSyncInteractiveVisualContent(resolvedContent);
  const streamId = Hooks.useBookmarksStreamId(resolvedContent);
  const tagsLayout = getTagsLayout(layoutResolution.effectiveLayout);

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
  const { pubky } = Providers.useProfileContext();
  const streamId = pubky ? (`${Core.StreamSource.AUTHOR}:${pubky}` as Core.AuthorStreamCompositeId) : undefined;
  const layoutResolution = Hooks.useFeedLayoutResolution(TIMELINE_FEED_VARIANT.PROFILE);
  const tagsLayout = getTagsLayout(layoutResolution.effectiveLayout);

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
  const streamId = Hooks.useHotStreamId();
  const layoutResolution = Hooks.useFeedLayoutResolution(TIMELINE_FEED_VARIANT.HOT);
  const tagsLayout = getTagsLayout(layoutResolution.effectiveLayout);

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
  const content = Core.useHomeStore((state) => state.content);
  const layoutResolution = Hooks.useFeedLayoutResolution(TIMELINE_FEED_VARIANT.SEARCH);
  const resolvedContent = resolveVisualFeedContent({
    content,
    variant: TIMELINE_FEED_VARIANT.SEARCH,
    isVisualActive: layoutResolution.isVisualActive,
  });
  Hooks.useSyncInteractiveVisualContent(resolvedContent);
  const streamId = Hooks.useSearchStreamId(resolvedContent);
  const tagsLayout = getTagsLayout(layoutResolution.effectiveLayout);

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
