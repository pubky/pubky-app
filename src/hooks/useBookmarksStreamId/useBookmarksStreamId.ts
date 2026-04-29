import { useMemo } from 'react';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, SORT, type ContentType, type SortType } from '@/stores/home/home.types';
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
export function useBookmarksStreamId(contentOverride?: ContentType): PostStreamTypes {
  const sort = useHomeStore((state) => state.sort);
  const content = useHomeStore((state) => state.content);
  const effectiveContent = contentOverride ?? content;

  /**
   * Mapping from Sort + Content filters to Bookmark stream types.
   * Bookmarks vary by sorting (timeline/total_engagement) and content type (kind).
   * Note: Reach filter is not supported for bookmarks by the Nexus API.
   */
  const streamId = useMemo(() => {
    const BOOKMARK_STREAM_MAP: Record<SortType, Record<ContentType, PostStreamTypes>> = {
      [SORT.TIMELINE]: {
        [CONTENT.ALL]: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
        [CONTENT.SHORT]: PostStreamTypes.TIMELINE_BOOKMARKS_SHORT,
        [CONTENT.LONG]: PostStreamTypes.TIMELINE_BOOKMARKS_LONG,
        [CONTENT.IMAGES]: PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE,
        [CONTENT.VIDEOS]: PostStreamTypes.TIMELINE_BOOKMARKS_VIDEO,
        [CONTENT.LINKS]: PostStreamTypes.TIMELINE_BOOKMARKS_LINK,
        [CONTENT.FILES]: PostStreamTypes.TIMELINE_BOOKMARKS_FILE,
      },
      [SORT.ENGAGEMENT]: {
        [CONTENT.ALL]: PostStreamTypes.POPULARITY_BOOKMARKS_ALL,
        [CONTENT.SHORT]: PostStreamTypes.POPULARITY_BOOKMARKS_SHORT,
        [CONTENT.LONG]: PostStreamTypes.POPULARITY_BOOKMARKS_LONG,
        [CONTENT.IMAGES]: PostStreamTypes.POPULARITY_BOOKMARKS_IMAGE,
        [CONTENT.VIDEOS]: PostStreamTypes.POPULARITY_BOOKMARKS_VIDEO,
        [CONTENT.LINKS]: PostStreamTypes.POPULARITY_BOOKMARKS_LINK,
        [CONTENT.FILES]: PostStreamTypes.POPULARITY_BOOKMARKS_FILE,
      },
    };

    return BOOKMARK_STREAM_MAP[sort][effectiveContent];
  }, [sort, effectiveContent]);

  return streamId;
}
