'use client';

import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { buildContentSearchStreamId, type PostStreamId } from '@/models/stream/post/postStream.types';
import { POST_STREAM_TAG_DELIMITER } from '@/services/nexus/stream/posts/postStream.constants';
import { useHomeStore } from '@/stores/home/home.store';
import { type ContentType, REACH } from '@/stores/home/home.types';
import { getKindFromContent, getStreamIdFromFilters } from '@/stores/home/home.utils';

/**
 * Custom hook that returns the search streamId based on the URL search criteria
 * and Sort/Content filters.
 *
 * Stream ID formats:
 * - Tag search: `{sorting}:{source}:{kind}:{tags}` (e.g. `timeline:all:all:pubky,bitcoin`)
 * - Full-text search: `content_search:q~{encodedQuery}:{kind}` (ignores sort; relevance-ranked)
 *
 * Note: Reach filter is always 'all' for search (we search all posts with the given tags).
 * Tags are limited to PUBKY_RUNTIME_MAX_STREAM_TAGS (default 5).
 *
 * @returns The search streamId, or undefined when there is no valid search criteria
 */
export function useSearchStreamId(contentOverride?: ContentType): PostStreamId | undefined {
  const criteria = useSearchCriteria();
  const sort = useHomeStore((state) => state.sort);
  const storeContent = useHomeStore((state) => state.content);
  const content = contentOverride ?? storeContent;

  if (criteria.mode === 'content') {
    return buildContentSearchStreamId(criteria.query, getKindFromContent(content));
  }

  if (criteria.mode !== 'tags') {
    return undefined;
  }

  // Always use 'all' reach for search.
  const baseStreamId = getStreamIdFromFilters(sort, REACH.ALL, content);
  return `${baseStreamId}:${criteria.tags.join(POST_STREAM_TAG_DELIMITER)}` as PostStreamId;
}
