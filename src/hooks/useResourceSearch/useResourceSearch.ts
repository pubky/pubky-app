'use client';

import { useEffect, useRef, useState } from 'react';
import { PINAKES_SEARCH_DEBOUNCE_MS, PINAKES_SEARCH_PAGE_SIZE } from '@/config/pinakes';
import { ResourceController, type TResourceSearchCursor } from '@/controllers/resource/resource';
import { isAppError } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { TResourceQuery } from '@/pipes/resource/resource.search';
import type { TPinakesCategoryFacet, TPinakesHostFacet, TPinakesTypeFacet } from '@/services/pinakes/pinakes.types';

export interface UseResourceSearchOptions {
  /** Rows one page asks for. */
  limit?: number;
  /** Also read the type counts and related tags of the whole result (the External resources tab). */
  facets?: boolean;
}

export interface UseResourceSearchResult {
  /** The rows' links read so far, in order, each once. */
  uris: string[];
  /** The types of the whole result with their paths and counts, with `facets`, once the first page is read. */
  typeFacets: TPinakesTypeFacet[] | null;
  /** Tags the results also carry, with `facets`. */
  relatedTags: string[];
  /** The services and categories of the whole result, with `facets` and the query's `extraFacets`. */
  hostFacets: TPinakesHostFacet[] | null;
  categoryFacets: TPinakesCategoryFacet[] | null;
  /** `nexus` when Pinakes failed and the resource stream answered instead. */
  source: 'pinakes' | 'nexus' | null;
  /** No source can answer the query (Pinakes not configured, the stream cannot stand in): no retry helps. */
  unavailable: boolean;
  /** Pinakes searched part of a large network only, on the first page. */
  reachTruncated: boolean;
  /** The first page is being read (or the query is settling). */
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /** Reads the query again from its first page, after an error. */
  retry: () => void;
}

/** Shown when no source can answer the query (Pinakes is not configured and the stream cannot stand in). */
export const RESOURCE_SEARCH_UNAVAILABLE = 'Searching external resources is not available right now.';

type TLoaded = {
  key: string;
  uris: string[];
  typeFacets: TPinakesTypeFacet[] | null;
  relatedTags: string[];
  hostFacets: TPinakesHostFacet[] | null;
  categoryFacets: TPinakesCategoryFacet[] | null;
  source: 'pinakes' | 'nexus' | null;
  unavailable: boolean;
  reachTruncated: boolean;
  hasMore: boolean;
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
};

const initialState = (key: string, isEnabled: boolean): TLoaded => ({
  key,
  uris: [],
  typeFacets: null,
  relatedTags: [],
  hostFacets: null,
  categoryFacets: null,
  source: null,
  unavailable: false,
  reachTruncated: false,
  hasMore: isEnabled,
  error: null,
  loading: isEnabled,
  loadingMore: false,
});

function errorMessage(error: unknown): string {
  // AppErrors are logged by their factory.
  if (isAppError(error)) return error.message;
  Logger.error('Failed to search external resources:', error);
  return 'An unknown error occurred.';
}

/** Pinakes refused the page (an expired or foreign cursor): the search starts over once. */
const isRefused = (error: unknown) => isAppError(error) && error.context?.statusCode === HttpStatusCode.BAD_REQUEST;

/**
 * A resource search, page by page: Pinakes ranks and filters (`ResourceController.fetchSearchPage`,
 * which falls back to Nexus' resource stream only for a query the stream can carry). The query is
 * asked once it has been still for `PINAKES_SEARCH_DEBOUNCE_MS`, so flipping filters spends little of
 * Pinakes' per-minute budget. Each link shows once. A next page Pinakes refuses starts the search
 * over from its first page, once; then the error stands, with `retry`. Kept per query: a page that
 * comes back for another one is dropped.
 *
 * @param query - The search; `null` reads nothing
 */
export function useResourceSearch(
  query: TResourceQuery | null,
  { limit = PINAKES_SEARCH_PAGE_SIZE, facets = false }: UseResourceSearchOptions = {},
): UseResourceSearchResult {
  const [attempt, setAttempt] = useState(0);
  const isEnabled = query !== null;
  const queryKey = JSON.stringify([query, limit, facets]);
  const key = JSON.stringify([queryKey, attempt]);
  const [state, setState] = useState<TLoaded>(() => initialState(key, isEnabled));
  // The query being read now, whether a next page is on its way, where it starts, and whether
  // this query already started over after a refused page. Set with each page, before any later read.
  const currentKey = useRef(key);
  const isLoadingMore = useRef(false);
  const next = useRef<TResourceSearchCursor | null>(null);
  const hasRestarted = useRef(false);
  const restartedFor = useRef(queryKey);

  useEffect(() => {
    // Another query may start over once again
    if (restartedFor.current !== queryKey) {
      restartedFor.current = queryKey;
      hasRestarted.current = false;
    }
    currentKey.current = key;
    isLoadingMore.current = false;
    next.current = null;
    if (query === null) return;
    const timer = setTimeout(() => {
      // A search started over (after a refused cursor, or Try again) reads past the cache
      const fresh = attempt > 0;
      ResourceController.fetchSearchPage({ query, limit, facets, ...(fresh ? { fresh } : {}) }).then(
        (page) => {
          if (currentKey.current !== key) return;
          next.current = page.next;
          setState({
            ...initialState(key, true),
            uris: [...new Set(page.uris)],
            typeFacets: page.typeFacets ?? null,
            relatedTags: page.relatedTags ?? [],
            hostFacets: page.hostFacets ?? null,
            categoryFacets: page.categoryFacets ?? null,
            source: page.source === 'unavailable' ? null : page.source,
            unavailable: page.source === 'unavailable',
            reachTruncated: page.reachTruncated ?? false,
            hasMore: page.next !== null,
            error: page.source === 'unavailable' ? RESOURCE_SEARCH_UNAVAILABLE : null,
            loading: false,
          });
        },
        (error: unknown) => {
          if (currentKey.current !== key) return;
          setState({ ...initialState(key, true), error: errorMessage(error), hasMore: false, loading: false });
        },
      );
    }, PINAKES_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `key` spells the query, `limit`, `facets` and the attempt: an equal query object reads nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state.key === key ? state : initialState(key, isEnabled);

  async function loadMore() {
    const cursor = next.current;
    if (query === null || current.loading || !current.hasMore || !cursor || isLoadingMore.current) return;
    const readKey = key;
    isLoadingMore.current = true;
    setState((prev) => (prev.key === readKey ? { ...prev, loadingMore: true } : prev));
    try {
      const page = await ResourceController.fetchSearchPage({ query, cursor, limit });
      if (currentKey.current !== readKey) return;
      next.current = page.next;
      setState((prev) =>
        prev.key === readKey
          ? {
              ...prev,
              uris: [...new Set([...prev.uris, ...page.uris])],
              hasMore: page.next !== null,
              error: null,
              loadingMore: false,
            }
          : prev,
      );
    } catch (error) {
      if (currentKey.current !== readKey) return;
      if (isRefused(error) && !hasRestarted.current) {
        hasRestarted.current = true;
        setAttempt((count) => count + 1);
        return;
      }
      const message = errorMessage(error);
      setState((prev) =>
        prev.key === readKey ? { ...prev, error: message, hasMore: false, loadingMore: false } : prev,
      );
    } finally {
      if (currentKey.current === readKey) isLoadingMore.current = false;
    }
  }

  function retry() {
    hasRestarted.current = false;
    setAttempt((count) => count + 1);
  }

  return {
    uris: current.uris,
    typeFacets: current.typeFacets,
    relatedTags: current.relatedTags,
    hostFacets: current.hostFacets,
    categoryFacets: current.categoryFacets,
    source: current.source,
    unavailable: current.unavailable,
    reachTruncated: current.reachTruncated,
    loading: current.loading,
    loadingMore: current.loadingMore,
    error: current.error,
    hasMore: current.hasMore,
    loadMore,
    retry,
  };
}
