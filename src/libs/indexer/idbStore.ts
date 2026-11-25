import Dexie from 'dexie';
import type { Coverage, Entry } from './indexer.types';
import {
  applyRun,
  assertValidBatch,
  evictCoverage,
  patchedState,
  runsOfScope,
  scopeOf,
  scopeState,
} from './store.helpers';
import {
  EMPTY_HOMESERVER_STATE,
  type HomeserverState,
  type IndexStore,
  type ScopeKey,
  type StoreBatch,
  type UserHomeserver,
} from './store.types';

/** A scope's winning entry for one path. */
interface EntryRow<D> extends ScopeKey {
  path: string;
  entry: Entry<D>;
}

interface CoverageRow extends ScopeKey {
  coverage: Coverage;
}

interface UserHomeserverRow {
  user: string;
  value: UserHomeserver;
}

interface HomeserverStateRow {
  homeserver: string;
  state: HomeserverState;
}

interface ScopeMembersRow {
  seed: string;
  members: Map<string, number>;
}

type ScopeTuple = [string, string, string];
type EntryKey = [string, string, string, string];

const ENTRY_KEY = '[author+homeserver+group+path]';
const SCOPE_KEY = '[author+homeserver+group]';

const scopeTuple = ({ author, homeserver, group }: ScopeKey): ScopeTuple => [author, homeserver, group];

export type IdbIndexStore<D> = IndexStore<D> & {
  /** Closes the connection for good; a new store on the same name reads the data again. */
  close(): void;
  /** Deletes the database and everything in it. */
  destroy(): Promise<void>;
};

/**
 * An `IndexStore` in IndexedDB, with the same semantics as the memory store. Payloads are stored by structured
 * clone, so `D` must be structured-cloneable: no functions, and class instances lose their prototype. Cursors
 * stay `bigint`, which structured clone keeps exactly. IndexedDB cannot index a `bigint`, so no key holds one.
 *
 * Entries are keyed by scope then path, so a scope's entries are one range of the primary key.
 */
export function createIdbStore<D>(databaseName: string): IdbIndexStore<D> {
  const db = new Dexie(databaseName);
  db.version(1).stores({
    runs: `++id, ${SCOPE_KEY}, homeserver`,
    userHomeservers: 'user',
    homeserverStates: 'homeserver',
    scopeMembers: 'seed',
  });
  // Nothing on version 1 has shipped, so its runs are dropped instead of migrated.
  db.version(2).stores({
    runs: null,
    entries: ENTRY_KEY,
    coverage: `${SCOPE_KEY}, homeserver`,
  });
  const entries = db.table<EntryRow<D>, EntryKey>('entries');
  const coverage = db.table<CoverageRow, ScopeTuple>('coverage');
  const userHomeservers = db.table<UserHomeserverRow, string>('userHomeservers');
  const homeserverStates = db.table<HomeserverStateRow, string>('homeserverStates');
  const scopeMembers = db.table<ScopeMembersRow, string>('scopeMembers');
  const tables = [entries, coverage, userHomeservers, homeserverStates, scopeMembers];

  const entriesOf = (scope: ScopeKey) =>
    entries.where(ENTRY_KEY).between([...scopeTuple(scope), Dexie.minKey], [...scopeTuple(scope), Dexie.maxKey]);

  const coverageOf = async (scope: ScopeKey): Promise<Coverage> =>
    (await coverage.get(scopeTuple(scope)))?.coverage ?? [];

  async function commit(batch: StoreBatch<D>): Promise<void> {
    // Validate and copy before the transaction: a rejected batch never touches the database.
    const copy = structuredClone(batch);
    assertValidBatch(copy);

    // One transaction for the whole batch, so a throw or a crash leaves all of it or none.
    await db.transaction('rw', tables, async () => {
      for (const homeserver of copy.deleteHomeservers ?? []) {
        for (const row of await coverage.where('homeserver').equals(homeserver).toArray()) {
          await entriesOf(row).delete();
          await coverage.delete(scopeTuple(row));
        }
      }
      for (const { scope, cutoff } of copy.evictions ?? []) {
        await entriesOf(scope)
          .filter((row) => row.entry.cursor <= cutoff)
          .delete();
        const kept = evictCoverage(await coverageOf(scope), cutoff);
        if (kept.length === 0) await coverage.delete(scopeTuple(scope));
        else await coverage.put({ ...scopeOf(scope), coverage: kept });
      }
      for (const run of copy.applyRuns ?? []) {
        // Reads and writes only the rows of the run's own paths.
        const keys = run.entries.map((entry): EntryKey => [...scopeTuple(run), entry.path]);
        const stored = new Map<string, Entry<D>>();
        for (const row of await entries.bulkGet(keys)) if (row !== undefined) stored.set(row.path, row.entry);
        const applied = applyRun(run, (path) => stored.get(path), await coverageOf(run));
        if (applied.changed.length > 0) {
          await entries.bulkPut(applied.changed.map((entry) => ({ ...scopeOf(run), path: entry.path, entry })));
        }
        await coverage.put({ ...scopeOf(run), coverage: applied.coverage });
      }
      await userHomeservers.bulkPut((copy.userHomeservers ?? []).map(({ user, value }) => ({ user, value })));
      for (const { homeserver, patch } of copy.homeserverStates ?? []) {
        const current = (await homeserverStates.get(homeserver))?.state ?? EMPTY_HOMESERVER_STATE;
        await homeserverStates.put({ homeserver, state: patchedState(current, patch) });
      }
      await scopeMembers.bulkPut(
        (copy.scopeMembers ?? []).map(({ seed, members }) => ({ seed, members: new Map(members) })),
      );
    });
  }

  async function readScope(scope: ScopeKey) {
    return db.transaction('r', [entries, coverage], async () => {
      const rows = await entriesOf(scope).toArray();
      return scopeState(
        rows.map((row) => row.entry),
        await coverageOf(scope),
      );
    });
  }

  // Reads need no copy: IndexedDB hands out a fresh structured clone on every read.
  return {
    commit,
    applyRuns: (runs) => commit({ applyRuns: runs }),
    readScope,
    readCoverage: coverageOf,
    exportRuns: async (scope) => runsOfScope(scope, await readScope(scope)),
    evictBelow: (scope, cutoff) => commit({ evictions: [{ scope, cutoff }] }),
    listScopes: async () => (await coverage.toArray()).map(scopeOf),
    deleteHomeserver: (homeserver) => commit({ deleteHomeservers: [homeserver] }),
    readUserHomeserver: async (user) => (await userHomeservers.get(user))?.value ?? null,
    writeUserHomeserver: (user, value) => commit({ userHomeservers: [{ user, value }] }),
    readHomeserverState: async (homeserver) =>
      (await homeserverStates.get(homeserver))?.state ?? { ...EMPTY_HOMESERVER_STATE },
    patchHomeserverState: (homeserver, patch) => commit({ homeserverStates: [{ homeserver, patch }] }),
    readScopeMembers: async (seed) => (await scopeMembers.get(seed))?.members ?? new Map<string, number>(),
    writeScopeMembers: (seed, members) => commit({ scopeMembers: [{ seed, members }] }),
    close: () => db.close(),
    destroy: () => db.delete(),
  };
}
