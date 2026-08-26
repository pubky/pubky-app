'use client';

import { useEffect, useRef, useState } from 'react';
import { TAG_MAX_LENGTH } from '@/config/posts';
import { SEARCH_CONTENT_TAGS_MAX_TOTAL, SEARCH_CONTENT_TAGS_PER_TERM_LIMIT } from '@/config/search';
import { SearchController } from '@/controllers/search/search';
import { Logger } from '@/libs/logger/logger';

interface UseContentSearchTagsResult {
  /** Deduped tag names — exact term matches first, then prefix extensions. */
  tags: string[];
  isLoading: boolean;
}

/**
 * useContentSearchTags
 *
 * Tags matching a full-text search query, for pivoting from content results to
 * a tag search (#1840). Nexus indexes tags by prefix only, so each query term
 * gets one `by_prefix` lookup (exact matches included) — parts of words
 * (`coin` for "bitcoin") cannot match without backend support.
 *
 * Fetches once per query — the query is already committed to the URL here, so
 * unlike autocomplete this never runs per keystroke.
 */
export function useContentSearchTags(query: string | null): UseContentSearchTagsResult {
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(query !== null);
  // Guards against out-of-order async responses overwriting newer results.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    if (query === null) {
      setTags([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // The query arrives normalized (trimmed, whitespace collapsed) from
    // `validateContentSearchQuery`. Tags are lowercase everywhere (store
    // writes, chip rendering), so terms are lowercased to match — and a term
    // longer than the tag length cap can never prefix-match any tag.
    const terms = Array.from(new Set(query.toLowerCase().split(' '))).filter((term) => term.length <= TAG_MAX_LENGTH);

    void (async () => {
      const resultsPerTerm = await Promise.all(
        terms.map((term) =>
          SearchController.getTagsByPrefix({ prefix: term, limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT }).catch(
            (error) => {
              Logger.error('[useContentSearchTags] Failed to fetch tags for term:', error);
              return [] as string[];
            },
          ),
        ),
      );

      // A newer query started while we awaited; its effect owns the state now.
      if (requestId !== requestIdRef.current) return;

      // Exact term matches lead the row (most likely pivot target), prefix
      // extensions follow, both in term order.
      const exactMatches: string[] = [];
      const prefixExtensions: string[] = [];
      resultsPerTerm.forEach((termTags, index) => {
        for (const tag of termTags) {
          (tag === terms[index] ? exactMatches : prefixExtensions).push(tag);
        }
      });
      const merged = Array.from(new Set([...exactMatches, ...prefixExtensions])).slice(
        0,
        SEARCH_CONTENT_TAGS_MAX_TOTAL,
      );

      setTags(merged);
      setIsLoading(false);
    })();
  }, [query]);

  return { tags, isLoading };
}
