import type { Run } from './indexer.types';
import { assertValidBatch, patchedState, scopeId } from './store.helpers';
import {
  EMPTY_HOMESERVER_STATE,
  type HomeserverState,
  type IndexStore,
  type ScopeKey,
  type StoreBatch,
  type UserHomeserver,
} from './store.types';

/**
 * An `IndexStore` held in memory. Values go through `structuredClone` both ways, the same copy an IndexedDB
 * store makes, so payloads must be structured-cloneable here too.
 */
export function createMemoryStore<D>(): IndexStore<D> {
  const runs = new Map<string, { scope: ScopeKey; runs: Run<D>[] }>();
  const userHomeservers = new Map<string, UserHomeserver>();
  const homeserverStates = new Map<string, HomeserverState>();
  const scopeMembers = new Map<string, Map<string, number>>();

  async function commit(batch: StoreBatch<D>): Promise<void> {
    // Validate and copy everything first: nothing below can throw, so a call applies whole or not at all.
    const copy = structuredClone(batch);
    assertValidBatch(copy);

    for (const homeserver of copy.deleteHomeservers ?? []) {
      for (const [id, stored] of runs) if (stored.scope.homeserver === homeserver) runs.delete(id);
    }
    for (const { scope, runs: replacement } of copy.replaceRuns ?? []) {
      const key = { author: scope.author, homeserver: scope.homeserver, group: scope.group };
      if (replacement.length === 0) runs.delete(scopeId(key));
      else runs.set(scopeId(key), { scope: key, runs: replacement });
    }
    for (const run of copy.appendRuns ?? []) {
      const id = scopeId(run);
      const stored = runs.get(id);
      if (stored !== undefined) stored.runs.push(run);
      else runs.set(id, { scope: { author: run.author, homeserver: run.homeserver, group: run.group }, runs: [run] });
    }
    for (const { user, value } of copy.userHomeservers ?? []) userHomeservers.set(user, value);
    for (const { homeserver, patch } of copy.homeserverStates ?? []) {
      homeserverStates.set(homeserver, patchedState(homeserverStates.get(homeserver) ?? EMPTY_HOMESERVER_STATE, patch));
    }
    for (const { seed, members } of copy.scopeMembers ?? []) scopeMembers.set(seed, new Map(members));
  }

  return {
    commit,
    readRuns: async (scope) => structuredClone(runs.get(scopeId(scope))?.runs ?? []),
    appendRuns: (appended) => commit({ appendRuns: appended }),
    replaceRuns: (scope, replacement) => commit({ replaceRuns: [{ scope, runs: replacement }] }),
    listScopes: async () => [...runs.values()].map(({ scope }) => ({ ...scope })),
    deleteHomeserverRuns: (homeserver) => commit({ deleteHomeservers: [homeserver] }),
    readUserHomeserver: async (user) => structuredClone(userHomeservers.get(user) ?? null),
    writeUserHomeserver: (user, value) => commit({ userHomeservers: [{ user, value }] }),
    readHomeserverState: async (homeserver) =>
      structuredClone(homeserverStates.get(homeserver) ?? { ...EMPTY_HOMESERVER_STATE }),
    patchHomeserverState: (homeserver, patch) => commit({ homeserverStates: [{ homeserver, patch }] }),
    readScopeMembers: async (seed) => new Map(scopeMembers.get(seed) ?? []),
    writeScopeMembers: (seed, members) => commit({ scopeMembers: [{ seed, members }] }),
  };
}
