import { isCancelledError } from '@tanstack/react-query';
import { HttpMethod } from '@/libs/http/http.types';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import {
  buildNexusQueryKey,
  getNexusResponseStartedAt,
  markNexusResponseStartedAt,
  queryNexus,
} from '@/services/nexus/nexus.utils';
import type { TStreamPostsByIdsParams } from '@/services/nexus/stream/posts/postStream.types';
import type { TUserStreamUsersByIdsParams } from '@/services/nexus/stream/users/userStream.types';

type ByIdsRequest = {
  url: string;
  body: TStreamPostsByIdsParams | TUserStreamUsersByIdsParams;
  force?: boolean;
};

type PendingBatch<T> = {
  ids: string[];
  promise: Promise<T[]>;
  isActive: () => boolean;
  isCurrent: () => boolean;
};

/**
 * Shares pending IDs between ordinary batch and card reads. TanStack still owns
 * caching and retries; this registry contains no settled data. Forced reads go
 * through queryNexus unchanged so an older request cannot satisfy an invalidation.
 */
export function createInFlightByIdsQuery<T>(getId: (record: T) => string) {
  const scopes = new Map<string, Map<string, PendingBatch<T>>>();

  return async ({ url, body, force }: ByIdsRequest): Promise<T[]> => {
    const ids = 'user_ids' in body ? body.user_ids : body.post_ids;
    const bodyFor = (requestedIds: string[]) =>
      JSON.stringify('user_ids' in body ? { ...body, user_ids: requestedIds } : { ...body, post_ids: requestedIds });
    const queryKeyFor = (requestedIds: string[]) =>
      buildNexusQueryKey({ url, method: HttpMethod.POST, body: bodyFor(requestedIds) });
    const getFreshResponse = (requestedIds: string[]): T[] | undefined => {
      const queryKey = queryKeyFor(requestedIds);
      const query = nexusQueryClient.getQueryCache().find<T[]>({ queryKey, exact: true });
      if (!query || query.state.data === undefined) return undefined;
      // Use the same resolved ordinary-query defaults and freshness decision as
      // TanStack's fetchQuery, even when a forced refresh is fetching or paused.
      const { staleTime } = nexusQueryClient.defaultQueryOptions<T[]>({ queryKey });
      const resolvedStaleTime = typeof staleTime === 'function' ? staleTime(query) : staleTime;
      return query.isStaleByTime(resolvedStaleTime) ? undefined : query.state.data;
    };
    const execute = (requestedIds: string[]) =>
      queryNexus<T[]>({ url, method: HttpMethod.POST, body: bodyFor(requestedIds), force });

    if (force || ids.length === 0) return await execute(ids);

    // An exact refresh may be newer than an overlapping pending batch. Let
    // TanStack reuse, join or revalidate that query under its ordinary policy,
    // rather than bypassing its cached result, invalidation or pending refresh.
    const cachedExact = getFreshResponse(ids);
    if (cachedExact !== undefined) return cachedExact;
    const exact = nexusQueryClient.getQueryState(queryKeyFor(ids));
    const hasExactQuery = exact !== undefined && (exact.data !== undefined || exact.fetchStatus !== 'idle');

    // Viewer, depth, attachment options and endpoint all affect the result.
    const scopeKey = JSON.stringify([url, bodyFor([])]);
    let pending = scopes.get(scopeKey);
    if (!pending) {
      pending = new Map();
      scopes.set(scopeKey, pending);
    }
    const batches = new Set<PendingBatch<T>>();
    let ownBatch: PendingBatch<T> | undefined;
    const selectedById = new Map<string, PendingBatch<T>>();
    const missing: string[] = [];
    for (const id of ids) {
      // An existing exact query goes through execute/register as a whole, so a
      // stale refetch also remains shareable with subsequent overlapping reads.
      const batch = hasExactQuery ? undefined : pending.get(id);
      if (batch?.isActive()) {
        batches.add(batch);
        selectedById.set(id, batch);
      } else missing.push(id);
    }

    if (missing.length > 0) {
      const cached = getFreshResponse(missing);
      const promise = cached === undefined ? execute(missing) : Promise.resolve(cached);
      const queryKey = queryKeyFor(missing);
      const query = nexusQueryClient.getQueryCache().find({ queryKey, exact: true });
      const isCurrent = () =>
        query !== undefined && nexusQueryClient.getQueryCache().find({ queryKey, exact: true }) === query;
      const batch: PendingBatch<T> = {
        ids: missing,
        promise,
        // A logout/cache clear can remove a query before its promise settles.
        // Never let a new lifetime join that removed (or replaced) request.
        isActive: () => query?.state.fetchStatus === 'fetching' && isCurrent(),
        isCurrent,
      };
      for (const id of missing) {
        // Cache hits are only this caller's result, never pending work. Only a
        // currently fetching batch can be joined; paused queries are not active.
        if (cached === undefined) pending.set(id, batch);
        selectedById.set(id, batch);
      }
      batches.add(batch);
      ownBatch = batch;
      const clear = () => {
        for (const id of missing) {
          if (pending.get(id) === batch) pending.delete(id);
        }
        if (pending.size === 0 && scopes.get(scopeKey) === pending) scopes.delete(scopeKey);
      };
      promise.then(clear, clear);
    }

    const selected = [...batches];
    // Preserve the response reference (and its freshness evidence) for exact batches.
    if (
      selected.length === 1 &&
      selected[0].ids.length === ids.length &&
      selected[0].ids.every((id, i) => id === ids[i])
    ) {
      return await selected[0].promise;
    }

    const failedBatches = new Map<PendingBatch<T>, unknown>();
    const pages = await Promise.all(
      selected.map((batch) =>
        batch.promise.catch((error: unknown) => {
          // Own failures still reject immediately. Cache-clear cancellation must
          // never start another request from the ended query lifetime.
          if (batch === ownBatch || isCancelledError(error)) throw error;
          failedBatches.set(batch, error);
          return [];
        }),
      ),
    );
    // A newer exact request can replace only some IDs in an older batch. Use
    // each ID's selected source, including omissions, rather than page order.
    const records = new Map(
      pages.flatMap((page, index) =>
        page.flatMap((record) => {
          const id = getId(record);
          return selectedById.get(id) === selected[index] ? [[id, record] as const] : [];
        }),
      ),
    );
    const responsePages = pages.filter((_page, index) => !failedBatches.has(selected[index]));
    const failedIds = ids.filter((id) => {
      const batch = selectedById.get(id);
      return batch !== undefined && failedBatches.has(batch);
    });
    if (failedIds.length > 0) {
      // The failure's consumer may have cleared the cache after it settled.
      // A fallback must not recreate requests from that ended lifetime.
      for (const [batch, error] of failedBatches) {
        if (!batch.isCurrent()) throw error;
      }
      // A joined request may fail because of IDs this caller never requested.
      // Fetch its affected IDs once under the ordinary query retry policy.
      const page = await execute(failedIds);
      responsePages.push(page);
      const requested = new Set(failedIds);
      for (const record of page) {
        const id = getId(record);
        if (requested.has(id)) records.set(id, record);
      }
    }
    const result = ids.flatMap((id) => {
      const record = records.get(id);
      return record === undefined ? [] : [record];
    });
    // A later caller does not make shared data fresher. Missing evidence in any
    // page also leaves the assembled response without a proven snapshot cutoff.
    const startedAt = Math.min(...responsePages.map((page) => getNexusResponseStartedAt(page) ?? 0));
    if (startedAt > 0 && Number.isFinite(startedAt)) markNexusResponseStartedAt(result, startedAt);
    return result;
  };
}
