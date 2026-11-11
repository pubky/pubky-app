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
    const execute = (requestedIds: string[]) =>
      queryNexus<T[]>({ url, method: HttpMethod.POST, body: bodyFor(requestedIds), force });

    if (force || ids.length === 0) return await execute(ids);

    // Viewer, depth, attachment options and endpoint all affect the result.
    const scopeKey = JSON.stringify([url, bodyFor([])]);
    let pending = scopes.get(scopeKey);
    if (!pending) {
      pending = new Map();
      scopes.set(scopeKey, pending);
    }
    const batches = new Set<PendingBatch<T>>();
    const missing: string[] = [];
    for (const id of ids) {
      const batch = pending.get(id);
      if (batch?.isActive()) batches.add(batch);
      else missing.push(id);
    }

    if (missing.length > 0) {
      const promise = execute(missing);
      const queryKey = ['nexus', url, HttpMethod.POST, bodyFor(missing)];
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
      for (const id of missing) pending.set(id, batch);
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
    const records = new Map(pages.flatMap((page) => page.map((record) => [getId(record), record] as const)));
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
