'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Libs from '@/libs';
import type { UseLocalFirstQueryParams, UseLocalFirstQueryResult } from './useLocalFirstQuery.types';

/**
 * Shared hook that encapsulates the local-first query pattern (ADR-0011).
 *
 * - `queryFn` runs inside `useLiveQuery` — pure, read-only, local-only IndexedDB read
 * - `fetchFn` runs inside `useEffect` — calls a `getOrFetch*` controller method that
 *   fetches from Nexus and persists to IndexedDB
 * - When `fetchFn` writes to IndexedDB, `useLiveQuery` automatically re-fires and
 *   picks up the new data
 *
 * This separation ensures Dexie's PSD context is never broken by network calls
 * or retry logic (see ADR-0011 for details).
 *
 * `isLoading` is `true` until both:
 * 1. `useLiveQuery` has resolved at least once (data is no longer `undefined`), AND
 * 2. If local data is `null` (cache miss), `fetchFn` has settled (resolved or rejected)
 *
 * This prevents consumers from seeing a false `{ data: null, isLoading: false }`
 * while a network fetch is still in-flight.
 *
 * @template T - The type of data returned by the query
 * @param params - Hook parameters
 * @returns The queried data and loading state
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLocalFirstQuery({
 *   queryFn: () => PostController.getDetails({ compositeId }),
 *   fetchFn: () => PostController.getOrFetch({ compositeId }),
 *   deps: [compositeId],
 *   enabled: !!compositeId,
 * });
 * ```
 */
export function useLocalFirstQuery<T>({
  queryFn,
  fetchFn,
  deps,
  enabled = true,
}: UseLocalFirstQueryParams<T>): UseLocalFirstQueryResult<T> {
  // Tracks whether `fetchFn` is currently in-flight. Used together with `data`
  // to derive `isLoading` — when local data is `null` (cache miss) and a fetch
  // is still pending, we keep `isLoading: true` so consumers don't flash a
  // "not found" state before the network response arrives.
  const [isFetching, setIsFetching] = useState(false);

  // Reactive read from IndexedDB — re-fires whenever the underlying data changes.
  // Returns `undefined` until the first query resolves (used to derive `isLoading`).
  // When `enabled` is false, short-circuits to `null` without calling `queryFn`.
  const data = useLiveQuery(
    async () => {
      if (!enabled) return null;
      try {
        return await queryFn();
      } catch (error) {
        Libs.Logger.error('[useLocalFirstQuery] queryFn failed', { error });
        return null;
      }
    },
    [...(deps as unknown[]), enabled],
    undefined,
  );

  // Fetch arm — ensures data exists in IndexedDB.
  // The controller's `getOrFetch*` method checks local first and only hits
  // the network if data is missing. When it writes to IndexedDB, the
  // `useLiveQuery` above automatically picks up the change.
  useEffect(() => {
    if (!enabled) {
      setIsFetching(false);
      return;
    }

    let cancelled = false;
    setIsFetching(true);

    fetchFn()
      .catch((error) => {
        if (!cancelled) {
          Libs.Logger.error('[useLocalFirstQuery] fetchFn failed', { error });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFetching(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  // `isLoading` is true when:
  // - `useLiveQuery` hasn't resolved yet (`data === undefined`), OR
  // - local data is a cache miss (`null`) and `fetchFn` is still in-flight
  //
  // When data is found locally (non-null object), `isLoading` is false
  // regardless of `isFetching` — we already have data to render.
  return {
    data,
    isLoading: data === undefined || (data === null && isFetching),
  };
}
