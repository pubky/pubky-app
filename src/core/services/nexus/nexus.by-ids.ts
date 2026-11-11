import { HttpMethod } from '@/libs/http/http.types';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import { getNexusResponseStartedAt, markNexusResponseStartedAt, queryNexus } from '@/services/nexus/nexus.utils';
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
    const queryKeyFor = (requestedIds: string[]) => ['nexus', url, HttpMethod.POST, bodyFor(requestedIds)];
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
    const hasExactQuery = nexusQueryClient.getQueryState(queryKeyFor(ids)) !== undefined;

    // Viewer, depth, attachment options and endpoint all affect the result.
    const scopeKey = JSON.stringify([url, bodyFor([])]);
    let pending = scopes.get(scopeKey);
    if (!pending) {
      pending = new Map();
      scopes.set(scopeKey, pending);
    }
    const batches = new Set<PendingBatch<T>>();
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
      const batch: PendingBatch<T> = {
        ids: missing,
        promise,
        // A logout/cache clear can remove a query before its promise settles.
        // Never let a new lifetime join that removed (or replaced) request.
        isActive: () =>
          query !== undefined &&
          query.state.fetchStatus === 'fetching' &&
          nexusQueryClient.getQueryCache().find({ queryKey, exact: true }) === query,
      };
      for (const id of missing) {
        // Cache hits are only this caller's result, never pending work. Genuine
        // paused fetches stay registered so they can be shared after resuming.
        if (cached === undefined) pending.set(id, batch);
        selectedById.set(id, batch);
      }
      batches.add(batch);
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

    const pages = await Promise.all(selected.map((batch) => batch.promise));
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
    const result = ids.flatMap((id) => {
      const record = records.get(id);
      return record === undefined ? [] : [record];
    });
    // A later caller does not make shared data fresher. Missing evidence in any
    // page also leaves the assembled response without a proven snapshot cutoff.
    const startedAt = Math.min(...pages.map((page) => getNexusResponseStartedAt(page) ?? 0));
    if (startedAt > 0 && Number.isFinite(startedAt)) markNexusResponseStartedAt(result, startedAt);
    return result;
  };
}
