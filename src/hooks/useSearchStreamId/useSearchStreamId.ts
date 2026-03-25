'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import * as Core from '@/core';
import { Env } from '@/libs/env/env';

/**
 * Parses tags from a comma-separated string parameter.
 * Trims whitespace, filters empty values, and limits to MAX_STREAM_TAGS.
 *
 * @param tagsParam - The raw tags parameter from URL (e.g., "pubky, bitcoin, nostr")
 * @returns Array of parsed tag strings
 */
function parseTags(tagsParam: string | null): string[] {
  if (!tagsParam || tagsParam.trim() === '') {
    return [];
  }

  return tagsParam
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, Env.NEXT_MAX_STREAM_TAGS);
}

/**
 * Custom hook that returns the search streamId based on URL tags and Sort/Content filters
 *
 * This hook:
 * 1. Reads tags from URL query parameters (?tags=pubky,bitcoin)
 * 2. Reads the current filter state from useHomeStore (sort, content)
 * 3. Returns the corresponding search stream ID
 *
 * Stream ID format: {sorting}:{source}:{kind}:{tags}
 * Example: timeline:all:all:pubky,bitcoin
 *
 * Note: Reach filter is always 'all' for search (we search all posts with the given tags).
 * Tags are limited to NEXT_MAX_STREAM_TAGS (default 5).
 *
 * @returns The search streamId or undefined if no tags provided
 *
 * @example
 * ```tsx
 * function SearchPage() {
 *   const streamId = useSearchStreamId();
 *   // With URL ?tags=pubky,bitcoin and default filters:
 *   // streamId will be 'timeline:all:all:pubky,bitcoin'
 *
 *   if (!streamId) {
 *     return <SearchEmptyState />;
 *   }
 *
 *   return <TimelinePosts streamId={streamId} />;
 * }
 * ```
 */
export function useSearchStreamId(): Core.PostStreamId | undefined {
  const searchParams = useSearchParams();
  const sort = Core.useHomeStore((state) => state.sort);
  const content = Core.useHomeStore((state) => state.content);

  const streamId = useMemo(() => {
    const tags = parseTags(searchParams.get('tags'));

    if (tags.length === 0) {
      return undefined;
    }

    // Get base stream ID from filters (always use 'all' reach for search)
    const baseStreamId = Core.getStreamIdFromFilters(sort, Core.REACH.ALL, content);

    // Append tags to the stream ID
    return `${baseStreamId}:${tags.join(Core.POST_STREAM_TAG_DELIMITER)}` as Core.PostStreamId;
  }, [searchParams, sort, content]);

  return streamId;
}

/**
 * Custom hook that returns the tags array from URL query parameters
 *
 * @returns Array of tag strings from the URL, limited to MAX_STREAM_TAGS
 *
 * @example
 * ```tsx
 * function SearchHeader() {
 *   const tags = useSearchTags();
 *   // With URL ?tags=pubky,bitcoin
 *   // tags will be ['pubky', 'bitcoin']
 *
 *   return (
 *     <div>
 *       Searching for: {tags.join(', ')}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSearchTags(): string[] {
  const searchParams = useSearchParams();

  return useMemo(() => parseTags(searchParams.get('tags')), [searchParams]);
}
