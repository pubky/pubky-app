import type { Coverage, Entry } from './indexer.types';
import {
  applyRun,
  assertValidBatch,
  deletedState,
  emptyExport,
  evictCoverage,
  homeserverStateOf,
  patchedState,
  readsCurrent,
  runsOfScope,
  sameCoverage,
  scopeId,
  scopeOf,
  scopeState,
  withData,
} from './store.helpers';
import {
  type HomeserverState,
  type IndexStore,
  type ScopeKey,
  type StoreBatch,
  type UserHomeserver,
} from './store.types';

interface CoverageRow {
  scope: ScopeKey;
  coverage: Coverage;
  /** Of the last commit that changed the scope. */
  stamp: number;
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
  // Per scope id: its winning entry per path, the stamp of the commit that wrote each, and its coverage. A scope with
  // entries always has coverage.
  const entries = new Map<string, Map<string, Entry<D>>>();
  const written = new Map<string, Map<string, number>>();
  const coverage = new Map<string, CoverageRow>();
  let lastStamp = 0;
  const userHomeservers = new Map<string, UserHomeserver>();
  const homeserverStates = new Map<string, HomeserverState>();
  const scopeMembers = new Map<string, Map<string, number>>();
  const meta = new Map<string, string>();

  async function commit(batch: StoreBatch<D>): Promise<number | null> {
    const copy = structuredClone(batch);
    assertValidBatch(copy);
    const stateOfHomeserver = (homeserver: string) => homeserverStateOf(homeserverStates.get(homeserver));
    if (!readsCurrent(copy.readAt, (homeserver) => stateOfHomeserver(homeserver).epoch)) return null;

    // Only a run that disagrees with a stored entry can still throw; the journal undoes what came before it.
    const writes = journal();
    const stamp = lastStamp + 1;
    let stamped = false;
    /** Writes the entry, or deletes the path for `undefined`, stamped. */
    const writeEntry = (id: string, path: string, entry: Entry<D> | undefined) => {
      let paths = entries.get(id);
      let stamps = written.get(id);
      if (paths === undefined || stamps === undefined) {
        if (entry === undefined) return;
        paths = new Map();
        stamps = new Map();
        writes.set(entries, id, paths);
        writes.set(written, id, stamps);
      }
      writes.set(paths, path, entry);
      writes.set(stamps, path, entry === undefined ? undefined : stamp);
    };
    const writeRow = (id: string, row: CoverageRow | undefined) => {
      writes.set(coverage, id, row);
      if (row === undefined) {
        writes.set(entries, id, undefined);
        writes.set(written, id, undefined);
      }
      stamped = true;
    };
    try {
      for (const { homeserver } of copy.deleteHomeservers ?? []) {
        for (const [id, row] of coverage) if (row.scope.homeserver === homeserver) writeRow(id, undefined);
      }
      for (const { scope, cutoff } of copy.evictions ?? []) {
        const id = scopeId(scope);
        const row = coverage.get(id);
        if (row === undefined) continue;
        const evicted = [...(entries.get(id) ?? [])].filter(([, entry]) => entry.cursor <= cutoff);
        for (const [path] of evicted) writeEntry(id, path, undefined);
        const kept = evictCoverage(row.coverage, cutoff);
        if (evicted.length > 0 || !sameCoverage(kept, row.coverage)) {
          writeRow(id, kept.length === 0 ? undefined : { scope: row.scope, coverage: kept, stamp });
        }
      }
      for (const run of copy.applyRuns ?? []) {
        const id = scopeId(run);
        const row = coverage.get(id);
        const applied = applyRun(run, (path) => entries.get(id)?.get(path), row?.coverage ?? []);
        for (const entry of applied.changed) writeEntry(id, entry.path, entry);
        if (row === undefined || applied.changed.length > 0 || !sameCoverage(row.coverage, applied.coverage)) {
          writeRow(id, { scope: scopeOf(run), coverage: applied.coverage, stamp });
        }
      }
      for (const { scope, path, cursor, data } of copy.recordData ?? []) {
        const id = scopeId(scope);
        const row = coverage.get(id);
        const filled = withData(entries.get(id)?.get(path), cursor, data);
        if (row === undefined || filled === null) continue;
        writeEntry(id, path, filled);
        writeRow(id, { ...row, stamp });
      }
    } catch (error) {
      writes.rollback();
      throw error;
    }
    if (stamped) lastStamp = stamp;

    for (const { homeserver, epoch } of copy.deleteHomeservers ?? []) {
      homeserverStates.set(homeserver, deletedState(stateOfHomeserver(homeserver), epoch));
    }
    for (const { user, value } of copy.userHomeservers ?? []) userHomeservers.set(user, value);
    for (const { homeserver, patch } of copy.homeserverStates ?? []) {
      homeserverStates.set(homeserver, patchedState(stateOfHomeserver(homeserver), patch));
    }
    for (const { seed, members } of copy.scopeMembers ?? []) scopeMembers.set(seed, new Map(members));
    return stamped ? stamp : null;
  }

  const stateOf = (scope: ScopeKey) => {
    const id = scopeId(scope);
    return scopeState(entries.get(id)?.values() ?? [], coverage.get(id)?.coverage ?? []);
  };

  return {
    commit,
    applyRuns: async (runs) => {
      await commit({ applyRuns: runs });
    },
    readScope: async (scope) => structuredClone(stateOf(scope)),
    readCoverage: async (scope) => structuredClone(coverage.get(scopeId(scope))?.coverage ?? []),
    exportRuns: async (scope) => structuredClone(runsOfScope(scope, stateOf(scope))),
    // Nothing awaited in between: one read.
    exportScopes: async (asked, { runs }) => {
      const out = emptyExport<D>();
      for (const scope of asked) {
        if (!out.homeservers.has(scope.homeserver)) {
          out.homeservers.set(scope.homeserver, homeserverStateOf(homeserverStates.get(scope.homeserver)));
        }
        const id = scopeId(scope);
        const row = coverage.get(id);
        if (row === undefined) continue;
        out.coverage.set(id, row.coverage);
        out.stamps.set(id, row.stamp);
        if (!runs) continue;
        out.runs.set(id, runsOfScope(scope, stateOf(scope)));
        out.written.set(id, new Map(written.get(id) ?? []));
      }
      return structuredClone(out);
    },
    evictBelow: async (scope, cutoff) => {
      await commit({ evictions: [{ scope, cutoff }] });
    },
    listScopes: async () => [...coverage.values()].map(({ scope }) => scopeOf(scope)),
    deleteHomeserver: async (homeserver, epoch) => {
      await commit({ deleteHomeservers: [{ homeserver, epoch }] });
    },
    readUserHomeserver: async (user) => structuredClone(userHomeservers.get(user) ?? null),
    writeUserHomeserver: async (user, value) => {
      await commit({ userHomeservers: [{ user, value }] });
    },
    readHomeserverState: async (homeserver) => structuredClone(homeserverStateOf(homeserverStates.get(homeserver))),
    patchHomeserverState: async (homeserver, patch) => {
      await commit({ homeserverStates: [{ homeserver, patch }] });
    },
    readScopeMembers: async (seed) => new Map(scopeMembers.get(seed) ?? []),
    writeScopeMembers: async (seed, members) => {
      await commit({ scopeMembers: [{ seed, members }] });
    },
    readMeta: async (key) => meta.get(key) ?? null,
    writeMeta: async (key, value) => {
      meta.set(key, value);
    },
  };
}
