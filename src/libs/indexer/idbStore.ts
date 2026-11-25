import Dexie, { type Table } from 'dexie';
import type { Run } from './indexer.types';
import { assertValidBatch, patchedState } from './store.helpers';
import {
  EMPTY_HOMESERVER_STATE,
  type HomeserverState,
  type IndexStore,
  type ScopeKey,
  type StoreBatch,
  type UserHomeserver,
} from './store.types';

type RunRow<D> = Run<D> & { id?: number };

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

const SCOPE_INDEX = '[author+homeserver+group]';

const scopeIndexKey = ({ author, homeserver, group }: ScopeKey) => [author, homeserver, group];

function scopeOfIndexKey(key: unknown): ScopeKey | null {
  if (!Array.isArray(key) || key.length !== 3) return null;
  const [author, homeserver, group]: unknown[] = key;
  if (typeof author !== 'string' || typeof homeserver !== 'string' || typeof group !== 'string') return null;
  return { author, homeserver, group };
}

const toRun = <D>({ author, homeserver, group, tail, head, entries }: RunRow<D>): Run<D> => ({
  author,
  homeserver,
  group,
  tail,
  head,
  entries,
});

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
 */
export function createIdbStore<D>(databaseName: string): IdbIndexStore<D> {
  const db = new Dexie(databaseName);
  db.version(1).stores({
    runs: `++id, ${SCOPE_INDEX}, homeserver`,
    userHomeservers: 'user',
    homeserverStates: 'homeserver',
    scopeMembers: 'seed',
  });
  const runs = db.table<RunRow<D>, number>('runs');
  const userHomeservers = db.table<UserHomeserverRow, string>('userHomeservers');
  const homeserverStates = db.table<HomeserverStateRow, string>('homeserverStates');
  const scopeMembers = db.table<ScopeMembersRow, string>('scopeMembers');
  const tables = [runs, userHomeservers, homeserverStates, scopeMembers];

  async function commit(batch: StoreBatch<D>): Promise<void> {
    // Validate and copy before the transaction: a rejected batch never touches the database.
    const copy = structuredClone(batch);
    assertValidBatch(copy);

    // One transaction for the whole batch, so a crash leaves all of it or none.
    await db.transaction('rw', tables, async () => {
      for (const homeserver of copy.deleteHomeservers ?? []) {
        await runs.where('homeserver').equals(homeserver).delete();
      }
      for (const { scope, runs: replacement } of copy.replaceRuns ?? []) {
        await runs.where(SCOPE_INDEX).equals(scopeIndexKey(scope)).delete();
        await runs.bulkAdd(replacement);
      }
      await runs.bulkAdd(copy.appendRuns ?? []);
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

  async function listScopes(): Promise<ScopeKey[]> {
    const scopes: ScopeKey[] = [];
    for (const key of await runs.orderBy(SCOPE_INDEX).uniqueKeys()) {
      const scope = scopeOfIndexKey(key);
      if (scope !== null) scopes.push(scope);
    }
    return scopes;
  }

  // Reads need no copy: IndexedDB hands out a fresh structured clone on every read.
  return {
    commit,
    readRuns: async (scope) => (await runs.where(SCOPE_INDEX).equals(scopeIndexKey(scope)).toArray()).map(toRun),
    appendRuns: (appended) => commit({ appendRuns: appended }),
    replaceRuns: (scope, replacement) => commit({ replaceRuns: [{ scope, runs: replacement }] }),
    listScopes,
    deleteHomeserverRuns: (homeserver) => commit({ deleteHomeservers: [homeserver] }),
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
