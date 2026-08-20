'use client';

import { useSearchParams } from 'next/navigation';
import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';
import { validateContentSearchQuery } from '@/libs/search/contentSearch';
import {
  buildContentSearchStreamId,
  getPostStreamKind,
  type PostStreamId,
} from '@/models/stream/post/postStream.types';
import { POST_STREAM_TAG_DELIMITER } from '@/services/nexus/stream/posts/postStream.constants';
import { useHomeStore } from '@/stores/home/home.store';
import { type ContentType, REACH } from '@/stores/home/home.types';
import { getStreamIdFromFilters } from '@/stores/home/home.utils';

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
    .slice(0, getMaxStreamTags());
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
 * Tags are limited to PUBKY_RUNTIME_MAX_STREAM_TAGS (default 5).
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
export function useSearchStreamId(contentOverride?: ContentType): PostStreamId | undefined {
  const searchParams = useSearchParams();
  const contentSearchQuery = useContentSearchQuery();
  const sort = useHomeStore((state) => state.sort);
  const storeContent = useHomeStore((state) => state.content);
  const content = contentOverride ?? storeContent;

  // Get base stream ID from filters (always use 'all' reach for search).
  // Its kind segment is shared by tag and full-text searches; full-text ignores sort.
  const baseStreamId = getStreamIdFromFilters(sort, REACH.ALL, content);
  if (contentSearchQuery) {
    return buildContentSearchStreamId(contentSearchQuery, getPostStreamKind(baseStreamId) ?? 'all');
  }

  const tags = parseTags(searchParams.get('tags'));
  if (tags.length === 0) {
    return undefined;
  }

  return `${baseStreamId}:${tags.join(POST_STREAM_TAG_DELIMITER)}` as PostStreamId;
}

/** Returns a normalized Nexus-compatible `q` parameter, or null when absent/invalid. */
export function useContentSearchQuery(): string | null {
  const searchParams = useSearchParams();
  const query = searchParams.get('q');
  if (query === null) {
    return null;
  }

  const validation = validateContentSearchQuery(query);
  return validation.isValid ? validation.query : null;
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

  return parseTags(searchParams.get('tags'));
}
