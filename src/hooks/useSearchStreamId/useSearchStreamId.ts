'use client';

import { useSearchParams } from 'next/navigation';
import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';
import { validateContentSearchQuery } from '@/libs/search/contentSearch';
import { buildContentSearchStreamId, type PostStreamId } from '@/models/stream/post/postStream.types';
import { POST_STREAM_TAG_DELIMITER } from '@/services/nexus/stream/posts/postStream.constants';
import { useHomeStore } from '@/stores/home/home.store';
import { type ContentType, REACH } from '@/stores/home/home.types';
import { getKindFromContent, getStreamIdFromFilters } from '@/stores/home/home.utils';

/**
 * Parses tags from a comma-separated string parameter.
 * Trims whitespace, lowercases (tags are case-insensitive everywhere else:
 * store writes, stream requests, chip rendering), filters empty values, and
 * limits to MAX_STREAM_TAGS.
 *
 * @param tagsParam - The raw tags parameter from URL (e.g., "pubky, Bitcoin, nostr")
 * @returns Array of parsed tag strings
 */
function parseTags(tagsParam: string | null): string[] {
  if (!tagsParam || tagsParam.trim() === '') {
    return [];
  }

  return tagsParam
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)
    .slice(0, getMaxStreamTags());
}

/**
 * The single source of truth for what the search page is searching for.
 *
 * Precedence: a non-empty `?q=` param wins over `?tags=` — including when it is
 * invalid (`mode: 'invalid'`), so a shared over-limit URL surfaces why the search
 * was dropped instead of silently falling back to tag results.
 */
export type SearchCriteria =
  | { mode: 'content'; query: string }
  | { mode: 'tags'; tags: string[] }
  // `query` carries the rejected input so the UI can offer it for editing.
  | { mode: 'invalid'; message: string; query: string }
  | { mode: 'none' };

/**
 * NOTE: the returned object's identity is only stable where the React Compiler
 * memoizes (the app build) — never rely on it in effect dependencies; derive
 * primitive values instead (see SearchInput's URL-sync effect).
 */
export function useSearchCriteria(): SearchCriteria {
  const searchParams = useSearchParams();
  const query = searchParams.get('q');

  // A blank q carries no intended search; fall through to tags.
  if (query !== null && query.trim() !== '') {
    const validation = validateContentSearchQuery(query);
    return validation.isValid
      ? { mode: 'content', query: validation.query }
      : { mode: 'invalid', message: validation.message, query: query.trim() };
  }

  const tags = parseTags(searchParams.get('tags'));
  return tags.length > 0 ? { mode: 'tags', tags } : { mode: 'none' };
}

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
