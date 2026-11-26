import Dexie from 'dexie';
import type { Coverage, Cursor, Entry, MergedRuns, RecordEntry } from './indexer.types';
import type { BulkScopeReader } from './readScopes';
import {
  applyRun,
  assertValidBatch,
  evictCoverage,
  patchedState,
  runsOfScope,
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

/** A scope with coverage, under the small id its entry rows carry instead of its three names. */
interface ScopeRow extends ScopeKey {
  id: number;
  coverage: Coverage;
}

type NewScopeRow = Omit<ScopeRow, 'id'> & { id?: number };

const TOMBSTONE = 0;
const RECORD = 1;

/**
 * A path's winning entry, stored under the key `[scope id, path]`, so the value holds neither. A tombstone is
 * `[0, cursor]`, a record `[1, cursor, hash, data]` with absent trailing fields cut off.
 */
type StoredEntry<D> = [kind: typeof TOMBSTONE | typeof RECORD, cursor: Cursor, hash?: string, data?: D];

type PathKey = [number, string];

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

interface MetaRow {
  key: string;
  value: string;
}

const SCOPE_INDEX = '[author+homeserver+group]';

const scopeTuple = ({ author, homeserver, group }: ScopeKey): [string, string, string] => [author, homeserver, group];

function packEntry<D>(entry: Entry<D>): StoredEntry<D> {
  if (entry.kind === 'tombstone') return [TOMBSTONE, entry.cursor];
  if (entry.data !== undefined) return [RECORD, entry.cursor, entry.hash, entry.data];
  return entry.hash === undefined ? [RECORD, entry.cursor] : [RECORD, entry.cursor, entry.hash];
}

function unpackEntry<D>(path: string, [kind, cursor, hash, data]: StoredEntry<D>): Entry<D> {
  if (kind === TOMBSTONE) return { kind: 'tombstone', path, cursor };
  const record: RecordEntry<D> = { kind: 'record', path, cursor };
  if (hash !== undefined) record.hash = hash;
  if (data !== undefined) record.data = data;
  return record;
}

const sameCoverage = (a: Coverage, b: Coverage) =>
  a.length === b.length && a.every((range, i) => range.tail === b[i].tail && range.head === b[i].head);

export type IdbIndexStore<D> = IndexStore<D> &
  Required<Pick<IndexStore<D>, 'readMeta' | 'writeMeta'>> &
  BulkScopeReader<D> & {
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
 * Each scope gets a small integer id and its entries are keyed by that id then path, so a scope is one range of
 * the primary key and no entry row repeats the author, homeserver or group.
 */
export function createIdbStore<D>(databaseName: string): IdbIndexStore<D> {
  const db = new Dexie(databaseName);
  db.version(1).stores({
    runs: `++id, ${SCOPE_INDEX}, homeserver`,
    userHomeservers: 'user',
    homeserverStates: 'homeserver',
    scopeMembers: 'seed',
  });
  // Nothing on version 1 has shipped, so its runs are dropped instead of migrated.
  db.version(2).stores({
    runs: null,
    entries: '[author+homeserver+group+path]',
    coverage: `${SCOPE_INDEX}, homeserver`,
  });
  // Nothing on version 2 has shipped, so its entries and coverage are dropped instead of migrated.
  db.version(3).stores({
    entries: null,
    coverage: null,
    scopes: `++id, &${SCOPE_INDEX}, homeserver`,
    paths: '',
    meta: 'key',
  });
  const scopes = db.table<ScopeRow, number, NewScopeRow>('scopes');
  const paths = db.table<StoredEntry<D>, PathKey>('paths');
  const userHomeservers = db.table<UserHomeserverRow, string>('userHomeservers');
  const homeserverStates = db.table<HomeserverStateRow, string>('homeserverStates');
  const scopeMembers = db.table<ScopeMembersRow, string>('scopeMembers');
  const meta = db.table<MetaRow, string>('meta');
  const tables = [scopes, paths, userHomeservers, homeserverStates, scopeMembers];

  const scopeRow = (scope: ScopeKey) => scopes.where(SCOPE_INDEX).equals(scopeTuple(scope)).first();

  const pathsOf = (id: number) => paths.where(':id').between([id, Dexie.minKey], [id, Dexie.maxKey]);

  /** A scope's entries in path order, its keys and values read as two batches over the same range. */
  async function entriesOf(id: number): Promise<Entry<D>[]> {
    const [keys, values] = await Promise.all([pathsOf(id).primaryKeys(), pathsOf(id).toArray()]);
    return values.map((value, i) => unpackEntry(keys[i][1], value));
  }

  async function stateOf(row: ScopeRow | undefined): Promise<MergedRuns<D>> {
    if (row === undefined) return scopeState([], []);
    // Ranges copied, so a scope asked for twice in one read gives two answers that share nothing.
    const coverage = row.coverage.map(({ tail, head }) => ({ tail, head }));
    return scopeState(await entriesOf(row.id), coverage);
  }

  async function commit(batch: StoreBatch<D>): Promise<void> {
    // Validate and copy before the transaction: a rejected batch never touches the database.
    const copy = structuredClone(batch);
    assertValidBatch(copy);

    // One transaction for the whole batch, so a throw or a crash leaves all of it or none.
    await db.transaction('rw', tables, async () => {
      for (const homeserver of copy.deleteHomeservers ?? []) {
        const ids = await scopes.where('homeserver').equals(homeserver).primaryKeys();
        for (const id of ids) await pathsOf(id).delete();
        await scopes.bulkDelete(ids);
      }
      for (const { scope, cutoff } of copy.evictions ?? []) {
        const row = await scopeRow(scope);
        if (row === undefined) continue;
        const evicted = (await entriesOf(row.id)).filter((entry) => entry.cursor <= cutoff);
        await paths.bulkDelete(evicted.map((entry): PathKey => [row.id, entry.path]));
        const kept = evictCoverage(row.coverage, cutoff);
        if (kept.length === 0) await scopes.delete(row.id);
        else await scopes.put({ ...row, coverage: kept });
      }
      for (const run of copy.applyRuns ?? []) {
        // Reads and writes only the rows of the run's own paths; a new scope has none to read.
        const row = await scopeRow(run);
        const stored = new Map<string, Entry<D>>();
        if (row !== undefined) {
          const values = await paths.bulkGet(run.entries.map((entry): PathKey => [row.id, entry.path]));
          values.forEach((value, i) => {
            const { path } = run.entries[i];
            if (value !== undefined) stored.set(path, unpackEntry(path, value));
          });
        }
        const applied = applyRun(run, (path) => stored.get(path), row?.coverage ?? []);
        const id = row?.id ?? (await scopes.add({ ...scopeOf(run), coverage: applied.coverage }));
        if (row !== undefined && !sameCoverage(row.coverage, applied.coverage)) {
          await scopes.put({ ...row, coverage: applied.coverage });
        }
        // Dexie types `bulkPut` keys as plain values, so compound keys go one `put` each, all in flight at once.
        await Promise.all(applied.changed.map((entry) => paths.put(packEntry(entry), [id, entry.path])));
      }
      for (const { scope, path, cursor, data } of copy.recordData ?? []) {
        const row = await scopeRow(scope);
        if (row === undefined) continue;
        const value = await paths.get([row.id, path]);
        const filled = withData(value === undefined ? undefined : unpackEntry(path, value), cursor, data);
        if (filled !== null) await paths.put(packEntry(filled), [row.id, path]);
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

  const readScope = (scope: ScopeKey) =>
    db.transaction('r', [scopes, paths], async () => stateOf(await scopeRow(scope)));

  // One transaction with every scope's reads in flight together, instead of a transaction per scope.
  const readScopes = (asked: readonly ScopeKey[]) =>
    db.transaction('r', [scopes, paths], () => Promise.all(asked.map(async (scope) => stateOf(await scopeRow(scope)))));

  // Reads need no copy: IndexedDB hands out a fresh structured clone on every read.
  return {
    commit,
    applyRuns: (runs) => commit({ applyRuns: runs }),
    readScope,
    readScopes,
    readCoverage: async (scope) => (await scopeRow(scope))?.coverage ?? [],
    exportRuns: async (scope) => runsOfScope(scope, await readScope(scope)),
    evictBelow: (scope, cutoff) => commit({ evictions: [{ scope, cutoff }] }),
    listScopes: async () => (await scopes.toArray()).map(scopeOf),
    deleteHomeserver: (homeserver) => commit({ deleteHomeservers: [homeserver] }),
    readUserHomeserver: async (user) => (await userHomeservers.get(user))?.value ?? null,
    writeUserHomeserver: (user, value) => commit({ userHomeservers: [{ user, value }] }),
    readHomeserverState: async (homeserver) =>
      (await homeserverStates.get(homeserver))?.state ?? { ...EMPTY_HOMESERVER_STATE },
    patchHomeserverState: (homeserver, patch) => commit({ homeserverStates: [{ homeserver, patch }] }),
    readScopeMembers: async (seed) => (await scopeMembers.get(seed))?.members ?? new Map<string, number>(),
    writeScopeMembers: (seed, members) => commit({ scopeMembers: [{ seed, members }] }),
    readMeta: async (key) => (await meta.get(key))?.value ?? null,
    writeMeta: async (key, value) => {
      await meta.put({ key, value });
    },
    close: () => db.close(),
    destroy: () => db.delete(),
  };
}
