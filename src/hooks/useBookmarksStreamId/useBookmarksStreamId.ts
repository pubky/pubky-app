import { useMemo } from 'react';
import * as Core from '@/core';

/**
 * Custom hook that returns the bookmarks streamId based on Sort and Content filters
 *
 * This hook reads the current filter state from useHomeStore and returns the corresponding
 * bookmarks stream ID based on:
 * - Sort: timeline (recent) or total_engagement (popularity)
 * - Content: all, short, long, image, video, link, file
 *
 * Note: Reach filter (all/following/friends) is not supported for bookmarks.
 *
 * @returns The bookmarks streamId as PostStreamTypes enum
 *
 * @example
 * ```tsx
 * function BookmarksPage() {
 *   const streamId = useBookmarksStreamId();
 *   // streamId will be PostStreamTypes.TIMELINE_BOOKMARKS_ALL by default
 *   // or PostStreamTypes.POPULARITY_BOOKMARKS_IMAGE if: sort=engagement, content=images
 *
 *   return <TimelinePosts streamId={streamId} />;
 * }
 * ```
 */
export function useBookmarksStreamId(contentOverride?: Core.ContentType): Core.PostStreamTypes {
  const sort = Core.useHomeStore((state) => state.sort);
  const content = Core.useHomeStore((state) => state.content);
  const effectiveContent = contentOverride ?? content;

  /**
   * Mapping from Sort + Content filters to Bookmark stream types.
   * Bookmarks vary by sorting (timeline/total_engagement) and content type (kind).
   * Note: Reach filter is not supported for bookmarks by the Nexus API.
   */
  const streamId = useMemo(() => {
    const BOOKMARK_STREAM_MAP: Record<Core.SortType, Record<Core.ContentType, Core.PostStreamTypes>> = {
      [Core.SORT.TIMELINE]: {
        [Core.CONTENT.ALL]: Core.PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
        [Core.CONTENT.SHORT]: Core.PostStreamTypes.TIMELINE_BOOKMARKS_SHORT,
        [Core.CONTENT.LONG]: Core.PostStreamTypes.TIMELINE_BOOKMARKS_LONG,
        [Core.CONTENT.IMAGES]: Core.PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE,
        [Core.CONTENT.VIDEOS]: Core.PostStreamTypes.TIMELINE_BOOKMARKS_VIDEO,
        [Core.CONTENT.LINKS]: Core.PostStreamTypes.TIMELINE_BOOKMARKS_LINK,
        [Core.CONTENT.FILES]: Core.PostStreamTypes.TIMELINE_BOOKMARKS_FILE,
      },
      [Core.SORT.ENGAGEMENT]: {
        [Core.CONTENT.ALL]: Core.PostStreamTypes.POPULARITY_BOOKMARKS_ALL,
        [Core.CONTENT.SHORT]: Core.PostStreamTypes.POPULARITY_BOOKMARKS_SHORT,
        [Core.CONTENT.LONG]: Core.PostStreamTypes.POPULARITY_BOOKMARKS_LONG,
        [Core.CONTENT.IMAGES]: Core.PostStreamTypes.POPULARITY_BOOKMARKS_IMAGE,
        [Core.CONTENT.VIDEOS]: Core.PostStreamTypes.POPULARITY_BOOKMARKS_VIDEO,
        [Core.CONTENT.LINKS]: Core.PostStreamTypes.POPULARITY_BOOKMARKS_LINK,
        [Core.CONTENT.FILES]: Core.PostStreamTypes.POPULARITY_BOOKMARKS_FILE,
      },
    };

    return BOOKMARK_STREAM_MAP[sort][effectiveContent];
  }, [sort, effectiveContent]);

  return streamId;
}
