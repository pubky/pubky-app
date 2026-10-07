'use client';

import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useSearchReach } from '@/hooks/useSearchReach/useSearchReach';
import { buildContentSearchStreamId, type PostStreamId } from '@/models/stream/post/postStream.types';
import { POST_STREAM_TAG_DELIMITER } from '@/services/nexus/stream/posts/postStream.constants';
import { useHomeStore } from '@/stores/home/home.store';
import { type ContentType } from '@/stores/home/home.types';
import { getKindFromContent, getStreamIdFromFilters } from '@/stores/home/home.utils';

/**
 * Custom hook that returns the search streamId based on the URL search criteria,
 * the Search reach (independent of Home) and the Sort/Content filters.
 *
 * Stream ID formats:
 * - Tag search: `{sorting}:{source}:{kind}:{tags}` (e.g. `timeline:wot:all:pubky,bitcoin`)
 * - Full-text search: `content_search:q~{encodedQuery}:{kind}[:reach:{following|friends|wot}]`
 *   (ignores sort; relevance-ranked)
 *
 * Tags are limited to PUBKY_RUNTIME_MAX_STREAM_TAGS (default 5).
 *
 * @returns The search streamId, or undefined when there is no valid search criteria
 */
export function useSearchStreamId(contentOverride?: ContentType): PostStreamId | undefined {
  const criteria = useSearchCriteria();
  const { reach, nexusReach } = useSearchReach();
  const sort = useHomeStore((state) => state.sort);
  const storeContent = useHomeStore((state) => state.content);
  const content = contentOverride ?? storeContent;

  if (criteria.mode === 'content') {
    return buildContentSearchStreamId(
      criteria.query,
      getKindFromContent(content),
      nexusReach ? { type: 'reach', reach: nexusReach } : undefined,
    );
  }

  if (criteria.mode !== 'tags') {
    return undefined;
  }

  const baseStreamId = getStreamIdFromFilters(sort, reach, content);
  return `${baseStreamId}:${criteria.tags.join(POST_STREAM_TAG_DELIMITER)}` as PostStreamId;
}
