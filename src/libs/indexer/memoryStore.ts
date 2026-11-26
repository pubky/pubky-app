import type { Coverage, Entry } from './indexer.types';
import {
  applyRun,
  assertValidBatch,
  evictCoverage,
  patchedState,
  runsOfScope,
  scopeId,
  scopeOf,
  scopeState,
  withData,
} from './store.helpers';
import {
  EMPTY_HOMESERVER_STATE,
  type HomeserverState,
  type IndexStore,
  type ScopeKey,
  type StoreBatch,
  type UserHomeserver,
} from './store.types';

interface CoverageRow {
  scope: ScopeKey;
  coverage: Coverage;
}

/** Map writes that can be undone, newest first, so a commit that throws halfway leaves nothing behind. */
function journal() {
  const undo: Array<() => void> = [];
  return {
    set<K, V>(map: Map<K, V>, key: K, value: V | undefined): void {
      const old = map.get(key);
      undo.push(() => {
        if (old === undefined) map.delete(key);
        else map.set(key, old);
      });
      if (value === undefined) map.delete(key);
      else map.set(key, value);
    },
    rollback(): void {
      for (const step of undo.reverse()) step();
    },
  };
}

/**
 * An `IndexStore` held in memory. Values go through `structuredClone` both ways, the same copy an IndexedDB
 * store makes, so payloads must be structured-cloneable here too.
 */
export function createMemoryStore<D>(): IndexStore<D> {
  // Per scope id: its winning entry per path, and its coverage. A scope with entries always has coverage.
  const entries = new Map<string, Map<string, Entry<D>>>();
  const coverage = new Map<string, CoverageRow>();
  const userHomeservers = new Map<string, UserHomeserver>();
  const homeserverStates = new Map<string, HomeserverState>();
  const scopeMembers = new Map<string, Map<string, number>>();
  const meta = new Map<string, string>();

  async function commit(batch: StoreBatch<D>): Promise<void> {
    const copy = structuredClone(batch);
    assertValidBatch(copy);

    // Only a run that disagrees with a stored entry can still throw; the journal undoes what came before it.
    const writes = journal();
    try {
      for (const homeserver of copy.deleteHomeservers ?? []) {
        for (const [id, row] of coverage) {
          if (row.scope.homeserver !== homeserver) continue;
          writes.set(coverage, id, undefined);
          writes.set(entries, id, undefined);
        }
      }
      for (const { scope, cutoff } of copy.evictions ?? []) {
        const id = scopeId(scope);
        const row = coverage.get(id);
        if (row === undefined) continue;
        const paths = entries.get(id) ?? new Map<string, Entry<D>>();
        for (const [path, entry] of paths) if (entry.cursor <= cutoff) writes.set(paths, path, undefined);
        if (paths.size === 0) writes.set(entries, id, undefined);
        const kept = evictCoverage(row.coverage, cutoff);
        writes.set(coverage, id, kept.length === 0 ? undefined : { scope: row.scope, coverage: kept });
      }
      for (const run of copy.applyRuns ?? []) {
        const id = scopeId(run);
        const paths = entries.get(id);
        const applied = applyRun(run, (path) => paths?.get(path), coverage.get(id)?.coverage ?? []);
        if (applied.changed.length > 0) {
          const target = paths ?? new Map<string, Entry<D>>();
          if (paths === undefined) writes.set(entries, id, target);
          for (const entry of applied.changed) writes.set(target, entry.path, entry);
        }
        writes.set(coverage, id, { scope: scopeOf(run), coverage: applied.coverage });
      }
      for (const { scope, path, cursor, data } of copy.recordData ?? []) {
        const paths = entries.get(scopeId(scope));
        const filled = withData(paths?.get(path), cursor, data);
        if (paths !== undefined && filled !== null) writes.set(paths, path, filled);
      }
    } catch (error) {
      writes.rollback();
      throw error;
    }

    for (const { user, value } of copy.userHomeservers ?? []) userHomeservers.set(user, value);
    for (const { homeserver, patch } of copy.homeserverStates ?? []) {
      homeserverStates.set(homeserver, patchedState(homeserverStates.get(homeserver) ?? EMPTY_HOMESERVER_STATE, patch));
    }
    for (const { seed, members } of copy.scopeMembers ?? []) scopeMembers.set(seed, new Map(members));
  }

  const stateOf = (scope: ScopeKey) => {
    const id = scopeId(scope);
    return scopeState(entries.get(id)?.values() ?? [], coverage.get(id)?.coverage ?? []);
  };

  return {
    commit,
    applyRuns: (runs) => commit({ applyRuns: runs }),
    readScope: async (scope) => structuredClone(stateOf(scope)),
    readCoverage: async (scope) => structuredClone(coverage.get(scopeId(scope))?.coverage ?? []),
    exportRuns: async (scope) => structuredClone(runsOfScope(scope, stateOf(scope))),
    evictBelow: (scope, cutoff) => commit({ evictions: [{ scope, cutoff }] }),
    listScopes: async () => [...coverage.values()].map(({ scope }) => scopeOf(scope)),
    deleteHomeserver: (homeserver) => commit({ deleteHomeservers: [homeserver] }),
    readUserHomeserver: async (user) => structuredClone(userHomeservers.get(user) ?? null),
    writeUserHomeserver: (user, value) => commit({ userHomeservers: [{ user, value }] }),
    readHomeserverState: async (homeserver) =>
      structuredClone(homeserverStates.get(homeserver) ?? { ...EMPTY_HOMESERVER_STATE }),
    patchHomeserverState: (homeserver, patch) => commit({ homeserverStates: [{ homeserver, patch }] }),
    readScopeMembers: async (seed) => new Map(scopeMembers.get(seed) ?? []),
    writeScopeMembers: (seed, members) => commit({ scopeMembers: [{ seed, members }] }),
    readMeta: async (key) => meta.get(key) ?? null,
    writeMeta: async (key, value) => {
      meta.set(key, value);
    },
  };
}
