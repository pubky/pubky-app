import type { StoreChange } from './crawler.types';
import { compareCursors } from './cursor';
import type { Domain } from './domain.types';
import { InvalidIndexInputError } from './indexer.errors';
import type { Cursor, Entry, Run } from './indexer.types';
import {
  decodeIndexFile,
  encodeIndexFile,
  IndexFileError,
  type IndexFileModel,
  isWriterId,
  type ReviveData,
} from './indexFile';
import { evictBelow } from './merge';
import { scopeId, scopeOf } from './store.helpers';
import type { IndexStore, ScopeKey, UserHomeserver } from './store.types';
import type { IndexerTransport } from './transport.types';

// Saving this device's index to a file in the user's storage, and starting from the files of other devices.

const WRITER_KEY = 'savedIndex.writer';
const FILE_SUFFIX = '.idx';

export const indexFileName = (writer: string): string => `${writer}${FILE_SUFFIX}`;

/** The writer id a file name carries, `null` for a name this library does not write. */
export function writerOfFile(name: string): string | null {
  if (!name.endsWith(FILE_SUFFIX)) return null;
  const writer = name.slice(0, -FILE_SUFFIX.length);
  return isWriterId(writer) ? writer : null;
}

const randomPart = () => Math.random().toString(36).slice(2, 12);

/**
 * This local store's writer id, made once and kept in the store, `null` when the store keeps no meta values: then
 * there is no saved index.
 */
export async function writerIdOf<D>(store: IndexStore<D>): Promise<string | null> {
  if (store.readMeta === undefined || store.writeMeta === undefined) return null;
  const known = await store.readMeta(WRITER_KEY);
  if (known !== null && isWriterId(known)) return known;
  const made = `${randomPart()}${randomPart()}`;
  const writer = made.length > 0 ? made : '0';
  await store.writeMeta(WRITER_KEY, writer);
  return writer;
}

const withoutData = <D>(entry: Entry<D>): Entry<D> => {
  if (entry.kind === 'tombstone' || entry.data === undefined) return entry;
  return entry.hash === undefined
    ? { kind: 'record', path: entry.path, cursor: entry.cursor }
    : { kind: 'record', path: entry.path, cursor: entry.cursor, hash: entry.hash };
};

export interface SnapshotParams<D> {
  store: IndexStore<D>;
  domain: Domain<D>;
  seed: string;
  writer: string;
  writtenAt: number;
  hops: number;
  windowDays: number;
}

/**
 * What the file of this writer holds: the seed's scope members with their homeservers, and the domain's groups of
 * each member on its current homeserver, with their data. Scopes loaded on demand are never read: a visited user is
 * no member, and a leaf scope is no domain group.
 */
export async function snapshotIndex<D>(params: SnapshotParams<D>): Promise<IndexFileModel<D>> {
  const { store, domain, seed } = params;
  const members = new Map(await store.readScopeMembers(seed));
  if (!members.has(seed)) members.set(seed, 0);
  const fileMembers: IndexFileModel['members'] = [];
  const runs: Run<D>[] = [];
  const homeservers = new Set<string>();
  for (const [user, hop] of members) {
    const resolved = await store.readUserHomeserver(user);
    fileMembers.push({ user, hop, homeserver: resolved });
    const homeserver = resolved?.homeserver ?? null;
    if (homeserver === null) continue;
    homeservers.add(homeserver);
    for (const group of domain.groups) {
      runs.push(...(await store.exportRuns({ author: user, homeserver, group: group.id })));
    }
  }
  // Read after the runs, so each mark is at least as new as every saved cursor of its homeserver.
  const highWater: IndexFileModel['highWater'] = [];
  for (const homeserver of homeservers) {
    const mark = (await store.readHomeserverState(homeserver)).highWater;
    if (mark !== null) highWater.push({ homeserver, highWater: mark });
  }
  return {
    writer: params.writer,
    writtenAt: params.writtenAt,
    seed,
    hops: params.hops,
    windowDays: params.windowDays,
    members: fileMembers,
    highWater,
    runs,
  };
}

/** The runs grouped by scope, only those `picked` picks. */
function byScopeOf<D>(runs: readonly Run<D>[], picked: (run: Run<D>) => boolean): Map<string, Run<D>[]> {
  const byScope = new Map<string, Run<D>[]>();
  for (const run of runs) {
    if (!picked(run)) continue;
    const id = scopeId(run);
    byScope.set(id, [...(byScope.get(id) ?? []), run]);
  }
  return byScope;
}

/**
 * Drops the data of the older half of the records with data of every scope `picked` picks, keeping the records.
 * `null` when none of them has data left.
 */
function halveData<D>(runs: readonly Run<D>[], picked: (run: Run<D>) => boolean): Run<D>[] | null {
  const cutoffs = new Map<string, Cursor>();
  for (const [id, scopeRuns] of byScopeOf(runs, picked)) {
    const cursors = scopeRuns
      .flatMap((run) =>
        run.entries.flatMap((entry) => (entry.kind === 'record' && entry.data !== undefined ? [entry.cursor] : [])),
      )
      .sort(compareCursors);
    if (cursors.length > 0) cutoffs.set(id, cursors[Math.ceil(cursors.length / 2) - 1]);
  }
  if (cutoffs.size === 0) return null;
  return runs.map((run) => {
    const cutoff = cutoffs.get(scopeId(run));
    if (cutoff === undefined) return run;
    return { ...run, entries: run.entries.map((entry) => (entry.cursor <= cutoff ? withoutData(entry) : entry)) };
  });
}

/**
 * Halves the history of every scope `trimmed` picks: evicts the older half of its entries, or the whole scope once
 * it has none. `null` when it picks no scope.
 */
function halve<D>(runs: readonly Run<D>[], trimmed: (run: Run<D>) => boolean): Run<D>[] | null {
  const byScope = byScopeOf(runs, trimmed);
  if (byScope.size === 0) return null;
  const halved = new Map<string, Run<D>[]>();
  for (const [id, scopeRuns] of byScope) {
    const cursors = scopeRuns.flatMap((run) => run.entries.map((entry) => entry.cursor)).sort(compareCursors);
    const top = scopeRuns.reduce((head, run) => (run.head > head ? run.head : head), scopeRuns[0].head);
    const cutoff = cursors.length === 0 ? top : cursors[Math.ceil(cursors.length / 2) - 1];
    halved.set(id, evictBelow(scopeRuns, cutoff));
  }
  const out: Run<D>[] = [];
  const placed = new Set<string>();
  for (const run of runs) {
    const id = scopeId(run);
    const replacement = halved.get(id);
    if (replacement === undefined) out.push(run);
    else if (!placed.has(id)) {
      placed.add(id);
      out.push(...replacement);
    }
  }
  return out;
}

/**
 * The file's bytes, within `budget` when trimming can get there. Data goes first, then windowed history, each oldest
 * first and farthest hop first, the seed's last: a hop's scopes lose the data of their older half of records until
 * none has data, and once no hop has any, a hop's windowed scopes are halved until they are empty. The full groups'
 * pointers, follows and profiles, are never trimmed, so a file over budget with only those left is written as it is.
 * This trims what is written, never the local store.
 */
export async function fitToBudget<D>(
  model: IndexFileModel<D>,
  budget: number,
  windowGroups: ReadonlySet<string>,
): Promise<Uint8Array> {
  let bytes = await encodeIndexFile(model);
  if (bytes.length <= budget) return bytes;
  const hopOf = new Map(model.members.map(({ user, hop }): [string, number] => [user, hop]));
  const hops = [...new Set(hopOf.values())].sort((a, b) => b - a);
  let runs = model.runs;
  const steps: Array<(from: readonly Run<D>[]) => Run<D>[] | null> = [
    ...hops.map((hop) => (from: readonly Run<D>[]) => halveData(from, (run) => hopOf.get(run.author) === hop)),
    ...hops.map(
      (hop) => (from: readonly Run<D>[]) =>
        halve(from, (run) => hopOf.get(run.author) === hop && windowGroups.has(run.group)),
    ),
  ];
  for (const step of steps) {
    for (let next = step(runs); next !== null; next = step(runs)) {
      runs = next;
      bytes = await encodeIndexFile({ ...model, runs });
      if (bytes.length <= budget) return bytes;
    }
  }
  return bytes;
}

export interface LoadParams<D> {
  transport: IndexerTransport;
  store: IndexStore<D>;
  seed: string;
  writer: string;
  now: number;
  /** Other writers' files older than this are deleted after loading. */
  expiryMs: number;
  /** The domain's group ids. A file with runs of another group was written reading other paths, such as another tree. */
  groups: readonly string[];
  /** Checks each stored payload; without it the records load without data. */
  reviveData?: ReviveData<D>;
  /** Opens a sealed file's bytes; a file it cannot open is ignored. */
  open?: (bytes: Uint8Array, name: string) => Promise<Uint8Array>;
}

export interface LoadOutcome {
  /** Files applied to the store. */
  loaded: number;
  /** Files that did not decode, had an unknown version, another seed or other groups, or runs the store refused. */
  ignored: number;
  /** Other writers' files deleted for their age. */
  expired: number;
  change: StoreChange;
  /** When the newest file applied was written (ms), `null` when none was. */
  writtenAt: number | null;
}

/** Applies one file: its runs, the homeservers the store lacks, and its high-water marks, which only raise the stored. */
async function applyFile<D>(store: IndexStore<D>, model: IndexFileModel<D>): Promise<void> {
  const userHomeservers: Array<{ user: string; value: UserHomeserver }> = [];
  for (const { user, homeserver } of model.members) {
    if (homeserver !== null && (await store.readUserHomeserver(user)) === null) {
      userHomeservers.push({ user, value: homeserver });
    }
  }
  const homeserverStates = model.highWater.map(({ homeserver, highWater }) => ({ homeserver, patch: { highWater } }));
  await store.commit({ applyRuns: model.runs, userHomeservers, homeserverStates });
}

/**
 * Reads the other writers' files, and this writer's own when the store is empty (a lost database), and applies those
 * of the same seed. Runs merge in any order, so several files simply combine. The scope members are written only
 * when the store has none, the union of the files' with each user's nearest hop; the next scope sync replaces them.
 */
export async function loadSavedIndex<D>(params: LoadParams<D>): Promise<LoadOutcome> {
  const { transport, store, seed, writer, now } = params;
  const empty = (await store.listScopes()).length === 0;
  const members = new Map<string, number>();
  const scopes = new Map<string, ScopeKey>();
  const expired: string[] = [];
  let loaded = 0;
  let ignored = 0;
  let writtenAt: number | null = null;
  for (const name of await transport.listIndexFiles()) {
    const fileWriter = writerOfFile(name);
    const own = fileWriter === writer;
    if (fileWriter === null || (own && !empty)) continue;
    let model: IndexFileModel<D>;
    try {
      const bytes = await transport.readIndexFile(name);
      if (bytes === null) continue;
      model = await decodeIndexFile(
        params.open === undefined ? bytes : await params.open(bytes, name),
        params.reviveData,
      );
    } catch (error) {
      if (error instanceof IndexFileError && error.code === 'unavailable') throw error;
      ignored += 1;
      continue;
    }
    if (model.writer !== fileWriter) {
      ignored += 1;
      continue;
    }
    if (!own && now - model.writtenAt > params.expiryMs) expired.push(name);
    // A mark read over other paths could name an author with no event in this domain's, which reads as a restore.
    if (model.seed !== seed || model.runs.some(({ group }) => !params.groups.includes(group))) {
      ignored += 1;
      continue;
    }
    try {
      await applyFile(store, model);
    } catch (error) {
      if (!(error instanceof InvalidIndexInputError)) throw error;
      ignored += 1;
      continue;
    }
    loaded += 1;
    writtenAt = Math.max(writtenAt ?? model.writtenAt, model.writtenAt);
    for (const run of model.runs) scopes.set(scopeId(run), scopeOf(run));
    for (const { user, hop } of model.members) members.set(user, Math.min(members.get(user) ?? hop, hop));
  }
  const seeds: string[] = [];
  if (members.size > 0 && (await store.readScopeMembers(seed)).size === 0) {
    await store.writeScopeMembers(seed, members);
    seeds.push(seed);
  }
  for (const name of expired) {
    try {
      await transport.deleteIndexFile(name);
    } catch {
      // Still expired at the next start, which deletes it then.
    }
  }
  return { loaded, ignored, expired: expired.length, change: { scopes: [...scopes.values()], seeds }, writtenAt };
}
