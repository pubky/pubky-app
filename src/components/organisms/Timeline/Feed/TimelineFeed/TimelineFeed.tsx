'use client';

import * as Core from '@/core';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Providers from '@/providers';
import type { TagsLayout } from '../../../PostMain/PostMain.types';
import type { TimelineFeedProps } from './TimelineFeed.types';
import { TIMELINE_FEED_VARIANT } from './TimelineFeed.types';
import { TimelineFeedWithStream } from '../TimelineFeedContent';

export { useTimelineFeedContext } from './TimelineFeedContext';

// ── Shared helpers ───────────────────────────────────────────────────────────

function useTagsLayoutFromHomeStore(): TagsLayout {
  const layout = Core.useHomeStore((s) => s.layout);
  return layout === Core.LAYOUT.WIDE ? 'side' : 'inline';
}

// ── Main component ───────────────────────────────────────────────────────────

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

// ── Variant wrappers ─────────────────────────────────────────────────────────
// Each wrapper calls only the hooks relevant to its variant, avoiding
// cross-variant subscription leaks. See ADR-0003 for stream architecture.

function HomeTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const streamId = Hooks.useStreamIdFromFilters();
  const tagsLayout = useTagsLayoutFromHomeStore();
  return (
    <TimelineFeedWithStream streamId={streamId} variant={TIMELINE_FEED_VARIANT.HOME} tagsLayout={tagsLayout}>
      {children}
    </TimelineFeedWithStream>
  );
}

function CustomTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const streamId = Hooks.useCustomStreamId();
  const customFeed = Hooks.useCustomFeed();
  const homeLayout = Core.useHomeStore((s) => s.layout);

  const customFeedLayout =
    customFeed?.layout !== undefined ? Core.pubkyLayoutToHomeLayout(customFeed.layout) : undefined;
  const effectiveLayout = customFeedLayout ?? homeLayout;
  const tagsLayout: TagsLayout = effectiveLayout === Core.LAYOUT.WIDE ? 'side' : 'inline';

  return (
    <TimelineFeedWithStream streamId={streamId} variant={TIMELINE_FEED_VARIANT.CUSTOM} tagsLayout={tagsLayout}>
      {children}
    </TimelineFeedWithStream>
  );
}

function BookmarksTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const streamId = Hooks.useBookmarksStreamId();
  const tagsLayout = useTagsLayoutFromHomeStore();
  return (
    <TimelineFeedWithStream streamId={streamId} variant={TIMELINE_FEED_VARIANT.BOOKMARKS} tagsLayout={tagsLayout}>
      {children}
    </TimelineFeedWithStream>
  );
}

function ProfileTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const { pubky } = Providers.useProfileContext();
  const streamId = pubky ? (`${Core.StreamSource.AUTHOR}:${pubky}` as Core.AuthorStreamCompositeId) : undefined;
  const tagsLayout = useTagsLayoutFromHomeStore();
  return (
    <TimelineFeedWithStream streamId={streamId} variant={TIMELINE_FEED_VARIANT.PROFILE} tagsLayout={tagsLayout}>
      {children}
    </TimelineFeedWithStream>
  );
}

function HotTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const streamId = Hooks.useHotStreamId();
  const tagsLayout = useTagsLayoutFromHomeStore();
  return (
    <TimelineFeedWithStream streamId={streamId} variant={TIMELINE_FEED_VARIANT.HOT} tagsLayout={tagsLayout}>
      {children}
    </TimelineFeedWithStream>
  );
}

function SearchTimelineFeed({ children }: { children?: TimelineFeedProps['children'] }) {
  const streamId = Hooks.useSearchStreamId();
  const tagsLayout = useTagsLayoutFromHomeStore();
  return (
    <TimelineFeedWithStream streamId={streamId} variant={TIMELINE_FEED_VARIANT.SEARCH} tagsLayout={tagsLayout}>
      {children}
    </TimelineFeedWithStream>
  );
}
