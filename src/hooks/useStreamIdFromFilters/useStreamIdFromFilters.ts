import type { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { useHomeStore } from '@/stores/home/home.store';
import type { ContentType } from '@/stores/home/home.types';
import { getStreamId } from '@/stores/home/home.utils';
/**
 * Custom hook that returns the current streamId based on global filter state
 *
 * This hook reads the current filter state from the filters store and
 * generates the appropriate streamId following the pattern: sorting:source:kind
 *
 * All valid filter combinations map to PostStreamTypes enum values.
 *
 * @returns The current streamId as PostStreamTypes enum
 *
 * @example
 * ```tsx
 * function Timeline() {
 *   const streamId = useStreamIdFromFilters();
 *   // streamId will be PostStreamTypes.TIMELINE_ALL_ALL by default
 *   // or PostStreamTypes.POPULARITY_FOLLOWING_IMAGE if filters are changed
 *
 *   const { data } = useQuery({
 *     queryKey: ['posts', streamId],
 *     queryFn: () => fetchPosts(streamId),
 *   });
 * }
 * ```
 */
export function useStreamIdFromFilters(contentOverride?: ContentType): PostStreamTypes {
  const sort = useHomeStore((state) => state.sort);
  const reach = useHomeStore((state) => state.reach);
  const content = useHomeStore((state) => state.content);
  const effectiveContent = contentOverride ?? content;

  return getStreamId(sort, reach, effectiveContent);
}
