'use client';

import { useEffect, useState } from 'react';
import { TAG_MAX_LENGTH } from '@/config/posts';
import { SEARCH_CONTENT_TAGS_MAX_TOTAL, SEARCH_CONTENT_TAGS_PER_TERM_LIMIT } from '@/config/search';
import { SearchController } from '@/controllers/search/search';
import { getCharacterCount, sanitizeTagInput } from '@/libs/utils/utils';

interface UseContentSearchTagsResult {
  /** Deduped tag names — exact term matches first, then prefix extensions. */
  tags: string[];
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

  useEffect(() => {
    // Cleared on every query change, not just on null — otherwise the previous
    // query's chips stay rendered (and clickable) while the new lookup is in
    // flight on a slow connection.
    setTags([]);

    if (query === null) return;

    // Set by the cleanup when the query changes or the hook unmounts, so a
    // response that lost the race can never overwrite newer results.
    let cancelled = false;

    // The query arrives normalized (trimmed, whitespace collapsed) from
    // `validateContentSearchQuery`. Tags are lowercase everywhere (store
    // writes, chip rendering), so terms are lowercased to match. Tag-banned
    // punctuation is stripped — tags can never contain it, so "bitcoin," would
    // never match while its natural "bitcoin" chip does — with the dedupe
    // after stripping because stripping can merge terms. A term longer than
    // the tag length cap (in code points, like tag validation) can never
    // prefix-match any tag.
    const terms = Array.from(new Set(query.toLowerCase().split(' ').map(sanitizeTagInput))).filter(
      (term) => term.length > 0 && getCharacterCount(term) <= TAG_MAX_LENGTH,
    );

    void (async () => {
      const resultsPerTerm = await Promise.all(
        terms.map((term) =>
          // A failed term degrades to no suggestions for it (the row is a
          // best-effort pivot, not primary content). The controller chain has
          // already logged the failure — no extra logging here.
          SearchController.fetchTagsByPrefix({ prefix: term, limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT }).catch(
            () => [] as string[],
          ),
        ),
      );

      if (cancelled) return;

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
    })();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return { tags };
}
