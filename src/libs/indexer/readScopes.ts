import type { MergedRuns } from './indexer.types';
import type { IndexStore, ScopeKey } from './store.types';

/** A store that reads many scopes at once, faster than one `readScope` per scope. */
export interface BulkScopeReader<D> {
  /** What `readScope` gives for each scope, in the order asked. */
  readScopes(scopes: readonly ScopeKey[]): Promise<MergedRuns<D>[]>;
}

/** Each scope as `readScope` reads it, in one bulk read when the store has one. */
export async function readScopesOf<D>(
  store: IndexStore<D> & Partial<BulkScopeReader<D>>,
  scopes: readonly ScopeKey[],
): Promise<MergedRuns<D>[]> {
  if (store.readScopes !== undefined) return store.readScopes(scopes);
  const read: MergedRuns<D>[] = [];
  for (const scope of scopes) read.push(await store.readScope(scope));
  return read;
}
