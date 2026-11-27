import type { StoreChange } from './crawler.types';
import { compareCursors } from './cursor';
import type { Domain } from './domain.types';
import { compareEpochs, type Epoch, newestEpoch, NO_EPOCH } from './epoch';
import { IndexerAbortedError, IndexerError, IndexFileLockedError, InvalidIndexInputError } from './indexer.errors';
import type { Cursor, Entry, Run } from './indexer.types';
import {
  decodeIndexFile,
  encodeIndexFile,
  IndexFileError,
  type IndexFileHomeserver,
  type IndexFileMember,
  type IndexFileModel,
  type IndexFilePack,
  type IndexFilePart,
  isWriterId,
} from './indexFile';
import { evictBelow } from './merge';
import type { IndexSealer } from './runtime.types';
import { scopeId, scopeOf } from './store.helpers';
import type {
  HomeserverState,
  IndexStore,
  ReadAt,
  ScopeKey,
  ScopesExport,
  StoreBatch,
  UserHomeserver,
} from './store.types';
import { buildTimeTable, cursorAt, type TimeSample } from './timeTable';
import type { IndexFileLock, IndexFiles } from './transport.types';

// The saved index: this user's index kept in their own storage as a folder that every device of theirs reads and
// writes, so a new device, or one that lost its database, starts warm. Under `3/<group tag>/`:
//   hot          shared: the members and their homeservers, the directory of packs, the graph of hops 0 and 1 and their
//                activity back to a cut; the whole index while that fits in `hotMaxBytes`
//   p/<S>/<b>    shared: every run of the members whose key hashes to bucket `b` of `S`
//   d/<writer>   one rolling delta per device, written only by it: what it synced since its changes were last folded
// A shared file changes only by a fold: lock it, read it, merge it into the local store, write the store's runs back
// under the lock, unlock. Every file is a set of valid runs, so any set of files a reader finds merges into a truthful
// index; a lock keeps work from being lost, never truth. Version 2 files, one per device at the folder's root, are
// still read, and a fold takes them in and deletes them.

const WRITER_KEY = 'savedIndex.writer';
const stateKey = (seed: string) => `savedIndex.state:${seed}`;
const VERSION_DIR = '3/';
const SINGLE_FILE = /^([A-Za-z0-9_-]{1,64})\.idx$/;
/** Microseconds per millisecond, the unit a domain dates a path in and the one a clock keeps. */
const MICROS_PER_MS = BigInt(1000);
/** Fetches of packs in flight at once, leaving the browser's other connections to the homeserver to the crawl. */
const PACK_READS = 4;

/** Sizes that shape the folder. Defaults suit production; tests shrink them. */
export interface SavedIndexLimits {
  /** `hot` holds the whole index while it fits in this; past it the authors spread over packs. */
  hotMaxBytes: number;
  /** A pack this large on average doubles the packs. */
  packSplitBytes: number;
  /** A pack this small on average halves the packs, down to `firstShards`. */
  packMergeBytes: number;
  /** Packs when the index first outgrows `hot`. */
  firstShards: number;
  /** A delta past this is folded instead of written. */
  deltaFoldBytes: number;
  /** What the budget keeps for each writer's delta. */
  deltaMaxBytes: number;
  /** A delta whose oldest change is this old is folded. */
  foldAgeMs: number;
  /** With packs, `hot` keeps the activity of hops 0 and 1 back to the time of their newest this many dated records. */
  hotDatedRecords: number;
  /** Lifetime asked for a lock, and how often a fold refreshes the lock on `hot` it holds. */
  lockSeconds: number;
  lockRefreshMs: number;
}

export const DEFAULT_SAVED_INDEX_LIMITS: Readonly<SavedIndexLimits> = Object.freeze({
  hotMaxBytes: 1024 * 1024,
  packSplitBytes: 512 * 1024,
  packMergeBytes: 128 * 1024,
  firstShards: 4,
  deltaFoldBytes: 48 * 1024,
  deltaMaxBytes: 64 * 1024,
  foldAgeMs: 24 * 60 * 60 * 1000,
  hotDatedRecords: 100,
  lockSeconds: 30,
  lockRefreshMs: 10 * 1000,
});

/** FNV-1a over the UTF-8 bytes. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
}

/** The pack of `author` among `shards`. A power of two, so doubling splits bucket `b` into `b` and `b + shards`. */
export const bucketOf = (author: string, shards: number): number => fnv1a32(author) % shards;

/**
 * The folder of a domain's groups: a deploy that reads other paths, such as the older social tree, keeps its own,
 * since a shared file cannot hold runs of two group sets.
 */
export async function folderOf(groups: readonly string[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([...groups].sort().join(',')));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${VERSION_DIR}g${hex.slice(0, 5)}/`;
}

export const hotPath = (folder: string) => `${folder}hot`;
export const deltaPath = (folder: string, writer: string) => `${folder}d/${writer}`;
export const packPath = (folder: string, shards: number, bucket: number) => `${folder}p/${shards}/${bucket}`;

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

/** A scope's head, as a decimal cursor, with the epoch of its homeserver when it was taken. */
type Heads = Record<string, [string, Epoch]>;

/** What this writer keeps in its store about the folder, in one meta value so it changes atomically. */
interface SavedState {
  /** Generation of the last delta this writer wrote. */
  gen: number;
  /** Generation of this writer's delta folded when it last rebased. */
  baseGen: number;
  /** When the oldest change still waiting for a fold went into the delta (ms). */
  since: number | null;
  /** Per scope, what the shared files hold as far as this writer knows: its delta carries what lies above. */
  base: Heads;
  /** Per scope, what the delta of generation `gen` carries, the base once `hot` records that generation folded. */
  sent: Heads;
  /** Per pack, the `writtenAt` of the version applied here. */
  packs: Record<string, number>;
}

const EMPTY_STATE: SavedState = Object.freeze({ gen: 0, baseGen: 0, since: null, base: {}, sent: {}, packs: {} });

function parseState(value: string | null): SavedState {
  if (value === null) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(value) as Partial<SavedState>;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    // Unreadable: the next delta starts from nothing, which is larger but still true.
    return EMPTY_STATE;
  }
}

const headOf = (heads: Heads, id: string, epoch: Epoch): Cursor | undefined => {
  const known = heads[id];
  return known !== undefined && known[1] === epoch ? BigInt(known[0]) : undefined;
};

/** Per scope the higher head of both, under the newer epoch. */
function higherHeads(a: Heads, b: Heads): Heads {
  const out: Heads = { ...a };
  for (const [id, [head, epoch]] of Object.entries(b)) {
    const known = out[id];
    const order = known === undefined ? 1 : compareEpochs(epoch, known[1]);
    if (known === undefined || order > 0 || (order === 0 && BigInt(head) > BigInt(known[0]))) {
      out[id] = [head, epoch];
    }
  }
  return out;
}

function sameHeads(a: Heads, b: Heads): boolean {
  const ids = Object.keys(a);
  return ids.length === Object.keys(b).length && ids.every((id) => b[id]?.[0] === a[id][0] && b[id]?.[1] === a[id][1]);
}

export interface SavedIndexParams<D> {
  files: IndexFiles;
  store: IndexStore<D>;
  domain: Domain<D>;
  seed: string;
  writer: string;
  now: () => number;
  hops: number;
  windowDays: number;
  /** Largest the whole folder aims for: past their share, packs lose data first, then windowed history. */
  budget: number;
  /** Another writer's delta that was folded and not written for this long is deleted by a fold. */
  expiryMs: number;
  /** Seals each file after it is compressed; a file that does not open is ignored, and a fold never overwrites it. */
  sealer?: IndexSealer;
  limits?: Partial<SavedIndexLimits>;
}

export interface LoadOutcome {
  /** Files applied to the store. */
  loaded: number;
  /** Files that did not open or decode, had an unknown version, another seed or other groups, or runs refused. */
  ignored: number;
  change: StoreChange;
  /** When the newest file applied was written (ms), `null` when none was. */
  writtenAt: number | null;
}

/** `unchanged`: nothing to write. `delta`: this writer's delta was written. `folded`: a fold took everything in. */
export type FlushOutcome = 'unchanged' | 'delta' | 'folded';

export interface SavedIndex {
  /**
   * Reads `hot` and the deltas, applies them in one commit and reports it, then the packs newer than what this store
   * applied, each reported as it lands. Without `hot`, the version 2 files instead.
   */
  load(onChange: (change: StoreChange) => void): Promise<LoadOutcome>;
  /**
   * Writes this writer's changes since its base as its delta. With `mayFold`, folds instead when the delta outgrew
   * `deltaFoldBytes`, its oldest change is `foldAgeMs` old, or the folder has no `hot` yet or version 2 files left;
   * a fold that cannot run (another writer folds, the lock was lost, a shared file does not read) writes the delta.
   */
  flush(mayFold: boolean): Promise<FlushOutcome>;
}

/** A shared file this device cannot read, which a fold must not overwrite. */
class FoldRefused extends IndexerError {}

type ReadResult<D> = { model: IndexFileModel<D>; bytes: number } | 'missing' | 'bad' | 'unsupported';

interface MemberScopes {
  members: Map<string, number>;
  homeserverOf: Map<string, UserHomeserver | null>;
  scopes: ScopeKey[];
}

/** Runs with the state of their homeservers read together with them, the only runs a file is made of. */
interface Exported<D> {
  homeservers: ReadonlyMap<string, HomeserverState>;
  runs: Run<D>[];
}

/** The runs of every exported scope, oldest range first. */
const allRuns = <D>(read: ScopesExport<D>): Run<D>[] => [...read.runs.values()].flat();

export function createSavedIndex<D>(params: SavedIndexParams<D>): SavedIndex {
  const { files, store, domain, seed, writer, now, sealer } = params;
  const limits = { ...DEFAULT_SAVED_INDEX_LIMITS, ...params.limits };
  const groups = domain.groups.map(({ id }) => id);
  const windowGroups = new Set(domain.groups.filter(({ history }) => history === 'window').map(({ id }) => id));
  const revive = domain.reviveData?.bind(domain);
  let folder: Promise<string> | null = null;
  const folderPath = () => (folder ??= folderOf(groups));
  /** Until a load finds `hot` and no version 2 file, the next flush that may fold does. */
  let foldWanted = true;

  async function readState(): Promise<SavedState> {
    return parseState((await store.readMeta?.(stateKey(seed))) ?? null);
  }

  async function writeState(state: SavedState): Promise<void> {
    await store.writeMeta?.(stateKey(seed), JSON.stringify(state));
  }

  async function readFile(path: string, expected: (model: IndexFileModel<D>) => boolean): Promise<ReadResult<D>> {
    const bytes = await files.read(path);
    if (bytes === null) return 'missing';
    let model: IndexFileModel<D>;
    try {
      model = await decodeIndexFile(sealer === undefined ? bytes : await sealer.open(bytes, path), revive);
    } catch (error) {
      if (error instanceof IndexFileError && error.code === 'unavailable') throw error;
      return error instanceof IndexFileError && error.code === 'unknown-version' ? 'unsupported' : 'bad';
    }
    // A run of a group this domain does not read was read over other paths: its mark could read as a restore.
    if (model.seed !== seed || !expected(model) || model.runs.some(({ group }) => !groups.includes(group)))
      return 'bad';
    return { model, bytes: bytes.length };
  }

  const isHot = (model: IndexFileModel<D>) => model.part.kind === 'hot';
  const isDeltaAt = (path: string) => (model: IndexFileModel<D>) =>
    model.part.kind === 'delta' && path.endsWith(`/d/${model.writer}`);
  const isPackOf = (shards: number, bucket: number) => (model: IndexFileModel<D>) =>
    model.part.kind === 'pack' && model.part.shards === shards && model.part.bucket === bucket;
  const isSingleAt = (path: string) => (model: IndexFileModel<D>) =>
    model.part.kind === 'single' && path === `${model.writer}.idx`;

  async function writeFile(path: string, model: IndexFileModel<D>, budget: number | null, lock?: IndexFileLock) {
    const bytes = budget === null ? await encodeIndexFile(model) : await fitToBudget(model, budget, windowGroups);
    const sealed = sealer === undefined ? bytes : await sealer.seal(bytes, path);
    await files.write(path, sealed, lock);
    return sealed.length;
  }

  async function headsOf(scopes: readonly ScopeKey[]): Promise<Heads> {
    const read = await store.exportScopes(scopes, { runs: false });
    const heads: Heads = {};
    for (const scope of scopes) {
      const coverage = read.coverage.get(scopeId(scope));
      if (coverage === undefined || coverage.length === 0) continue;
      const epoch = read.homeservers.get(scope.homeserver)?.epoch ?? NO_EPOCH;
      heads[scopeId(scope)] = [coverage[coverage.length - 1].head.toString(), epoch];
    }
    return heads;
  }

  /**
   * Merges files into the store in one commit. Per homeserver the newest epoch any of them or the store has wins
   * (`epoch.ts`): runs read from another log are left out, and a store that read another log drops what it holds of
   * the homeserver and takes the newest. Each dated record is a sample of its homeserver's clock, so the clock is rebuilt
   * from what is applied. Files that contradict each other or the store are tried one by one, the refused ones
   * ignored. With `base`, a scope that held nothing this writer had not shared takes the head the files bring.
   */
  async function applyFiles(
    models: readonly IndexFileModel<D>[],
    base?: Heads,
  ): Promise<{ applied: IndexFileModel<D>[]; refused: number; change: StoreChange }> {
    const none = { applied: [], refused: 0, change: { scopes: [], seeds: [] } };
    if (models.length === 0) return none;
    const homeservers = new Set(
      models.flatMap(({ homeservers: rows, runs }) => [
        ...rows.map(({ homeserver }) => homeserver),
        ...runs.map(({ homeserver }) => homeserver),
      ]),
    );
    const local = new Map<string, Epoch>();
    for (const homeserver of homeservers) local.set(homeserver, (await store.readHomeserverState(homeserver)).epoch);
    const epochIn = (model: IndexFileModel<D>, homeserver: string) =>
      model.homeservers.find((row) => row.homeserver === homeserver)?.epoch ?? NO_EPOCH;
    const target = new Map(
      [...homeservers].map((homeserver): [string, Epoch] => [
        homeserver,
        newestEpoch([local.get(homeserver) ?? NO_EPOCH, ...models.map((model) => epochIn(model, homeserver))]),
      ]),
    );
    const moved = [...target].filter(([homeserver, epoch]) => epoch !== local.get(homeserver));
    const kept = models.map((model) => ({
      ...model,
      homeservers: model.homeservers.filter((row) => row.epoch === target.get(row.homeserver)),
      runs: model.runs.filter((run) => epochIn(model, run.homeserver) === target.get(run.homeserver)),
    }));
    const scopes = [...new Map(kept.flatMap(({ runs }) => runs).map((run) => [scopeId(run), scopeOf(run)])).values()];
    const before = base === undefined ? null : await headsOf(scopes);

    const userHomeservers: Array<{ user: string; value: UserHomeserver }> = [];
    const newest = new Map<string, UserHomeserver>();
    for (const { members } of kept) {
      for (const { user, homeserver } of members) {
        if (homeserver === null) continue;
        const known = newest.get(user) ?? (await store.readUserHomeserver(user));
        if (known === null || homeserver.resolvedAt > known.resolvedAt) newest.set(user, homeserver);
      }
    }
    for (const [user, value] of newest) userHomeservers.push({ user, value });
    const clocks = new Map<string, TimeSample[]>();
    for (const run of kept.flatMap(({ runs }) => runs)) {
      for (const entry of run.entries) {
        const time = entry.kind === 'record' ? domain.timeOfPath(entry.path) : null;
        if (time === null) continue;
        const samples = clocks.get(run.homeserver) ?? [];
        samples.push({ cursor: entry.cursor, ms: Number(time / MICROS_PER_MS), writer: run.author });
        clocks.set(run.homeserver, samples);
      }
    }
    const fileMembers = new Map<string, number>();
    for (const { members } of kept) {
      for (const { user, hop } of members) fileMembers.set(user, Math.min(fileMembers.get(user) ?? hop, hop));
    }
    const seeds = fileMembers.size > 0 && (await store.readScopeMembers(seed)).size === 0 ? [seed] : [];
    const batch: StoreBatch<D> = {
      // A restore found meanwhile voids what these files hold of that homeserver.
      readAt: [...local].map(([homeserver, epoch]): ReadAt => ({ homeserver, epoch })),
      // A homeserver never read takes the files' log; one read from another log drops what it read.
      deleteHomeservers: moved.flatMap(([homeserver, epoch]) =>
        local.get(homeserver) === NO_EPOCH ? [] : [{ homeserver, epoch }],
      ),
      applyRuns: kept.flatMap(({ runs }) => runs),
      userHomeservers,
      homeserverStates: [
        ...kept.flatMap(({ homeservers: rows }) =>
          rows.flatMap(({ homeserver, highWater }) =>
            highWater === null ? [] : [{ homeserver, patch: { highWater } }],
          ),
        ),
        ...[...clocks].map(([homeserver, clock]) => ({ homeserver, patch: { clock } })),
        ...moved.flatMap(([homeserver, epoch]) =>
          local.get(homeserver) === NO_EPOCH ? [{ homeserver, patch: { epoch } }] : [],
        ),
      ],
      ...(seeds.length > 0 ? { scopeMembers: [{ seed, members: fileMembers }] } : {}),
    };
    try {
      await store.commit(batch);
    } catch (error) {
      if (!(error instanceof InvalidIndexInputError)) throw error;
      if (models.length === 1) return { ...none, refused: 1 };
      const outcomes: Array<Awaited<ReturnType<typeof applyFiles>>> = [];
      for (const model of models) outcomes.push(await applyFiles([model], base));
      return {
        applied: outcomes.flatMap(({ applied }) => applied),
        refused: outcomes.reduce((sum, { refused }) => sum + refused, 0),
        change: {
          scopes: outcomes.flatMap(({ change }) => change.scopes),
          seeds: [...new Set(outcomes.flatMap(({ change }) => change.seeds))],
        },
      };
    }
    if (base !== undefined && before !== null) {
      const after = await headsOf(scopes);
      for (const [id, head] of Object.entries(after)) {
        const had = before[id];
        const shared = base[id];
        const unchanged =
          had === undefined
            ? shared === undefined
            : shared !== undefined && shared[0] === had[0] && shared[1] === had[1];
        if (unchanged) base[id] = head;
      }
    }
    return { applied: kept, refused: 0, change: { scopes, seeds } };
  }

  async function memberScopes(): Promise<MemberScopes> {
    const members = await store.readScopeMembers(seed);
    if (!members.has(seed)) members.set(seed, 0);
    const homeserverOf = new Map<string, UserHomeserver | null>();
    const scopes: ScopeKey[] = [];
    for (const user of members.keys()) {
      const resolved = await store.readUserHomeserver(user);
      homeserverOf.set(user, resolved);
      const homeserver = resolved?.homeserver ?? null;
      if (homeserver === null) continue;
      for (const group of groups) scopes.push({ author: user, homeserver, group });
    }
    return { members, homeserverOf, scopes };
  }

  /**
   * A file of the exported runs, with the member rows of `users` and the epoch and mark of every homeserver its runs
   * name, as read with them.
   */
  function modelOf(
    part: IndexFilePart,
    ms: MemberScopes,
    users: readonly string[],
    { homeservers: states, runs }: Exported<D>,
  ): IndexFileModel<D> {
    const members: IndexFileMember[] = users.map((user) => ({
      user,
      hop: ms.members.get(user) ?? 0,
      homeserver: ms.homeserverOf.get(user) ?? null,
    }));
    const homeservers: IndexFileHomeserver[] = [...new Set(runs.map((run) => run.homeserver))].map((homeserver) => {
      const state = states.get(homeserver);
      return { homeserver, epoch: state?.epoch ?? NO_EPOCH, highWater: state?.highWater ?? null };
    });
    return {
      part,
      writer,
      writtenAt: now(),
      seed,
      hops: params.hops,
      windowDays: params.windowDays,
      members,
      homeservers,
      runs,
    };
  }

  /** Every run the store holds of `users`' scopes, oldest range first, with their homeservers' states. */
  async function runsOf(ms: MemberScopes, users: ReadonlySet<string>): Promise<Exported<D>> {
    const read = await store.exportScopes(
      ms.scopes.filter(({ author }) => users.has(author)),
      { runs: true },
    );
    return { homeservers: read.homeservers, runs: allRuns(read) };
  }

  /** This writer's delta: per scope what lies above its base, the whole scope where the base is unknown or gapped. */
  async function deltaOf(state: SavedState, ms: MemberScopes) {
    const above = (read: ScopesExport<D>, scope: ScopeKey, head: Cursor) => {
      const base = headOf(state.base, scopeId(scope), read.homeservers.get(scope.homeserver)?.epoch ?? NO_EPOCH);
      return base === undefined || base < head;
    };
    const glance = await store.exportScopes(ms.scopes, { runs: false });
    const moved = ms.scopes.filter((scope) => {
      const coverage = glance.coverage.get(scopeId(scope));
      return coverage !== undefined && coverage.length > 0 && above(glance, scope, coverage[coverage.length - 1].head);
    });
    // Read again with the runs, and judged by what this read says: a restore since the glance moved the epoch.
    const read = await store.exportScopes(moved, { runs: true });
    const runs: Run<D>[] = [];
    const users = new Set<string>();
    const heads: Heads = {};
    for (const scope of moved) {
      const exported = read.runs.get(scopeId(scope)) ?? [];
      if (exported.length === 0) continue;
      const top = exported[exported.length - 1];
      if (!above(read, scope, top.head)) continue;
      const epoch = read.homeservers.get(scope.homeserver)?.epoch ?? NO_EPOCH;
      const base = headOf(state.base, scopeId(scope), epoch);
      users.add(scope.author);
      heads[scopeId(scope)] = [top.head.toString(), epoch];
      if (base !== undefined && base >= top.tail) {
        runs.push({ ...top, tail: base, entries: top.entries.filter(({ cursor }) => cursor > base) });
      } else runs.push(...exported);
    }
    const part: IndexFilePart = { kind: 'delta', gen: state.gen + 1, base: state.baseGen };
    return { model: modelOf(part, ms, [...users], { homeservers: read.homeservers, runs }), heads };
  }

  /**
   * With packs, `hot` keeps the activity of hops 0 and 1 above one time for all of them, that of their newest
   * `hotDatedRecords` dated records, placed per homeserver by its clock: a feed stops above the latest start of its
   * authors' histories, so a cut per author would end it at the busiest one's. `null` per homeserver keeps it whole.
   */
  function cutOf(near: Exported<D>): Map<string, Cursor> {
    const times: number[] = [];
    for (const run of near.runs) {
      if (!windowGroups.has(run.group)) continue;
      for (const entry of run.entries) {
        const time = entry.kind === 'record' ? domain.timeOfPath(entry.path) : null;
        if (time !== null) times.push(Number(time / MICROS_PER_MS));
      }
    }
    const cut = new Map<string, Cursor>();
    if (times.length < limits.hotDatedRecords) return cut;
    const at = times.sort((a, b) => b - a)[limits.hotDatedRecords - 1];
    for (const [homeserver, state] of near.homeservers) {
      const placed = cursorAt(buildTimeTable(state.clock), at);
      if (placed !== null) cut.set(homeserver, placed);
    }
    return cut;
  }

  async function hotOf(ms: MemberScopes, part: Extract<IndexFilePart, { kind: 'hot' }>): Promise<IndexFileModel<D>> {
    const users = [...ms.members.keys()];
    if (part.shards === 0) return modelOf(part, ms, users, await runsOf(ms, new Set(users)));
    const near = await runsOf(ms, new Set(users.filter((user) => (ms.members.get(user) ?? 0) <= 1)));
    const cut = cutOf(near);
    const byScope = new Map<string, Run<D>[]>();
    for (const run of near.runs) byScope.set(scopeId(run), [...(byScope.get(scopeId(run)) ?? []), run]);
    const runs = [...byScope.values()].flatMap((exported) => {
      const { group, homeserver } = exported[0];
      const cutoff = windowGroups.has(group) ? cut.get(homeserver) : undefined;
      return cutoff === undefined ? exported : evictBelow(exported, cutoff);
    });
    const cutPart = { ...part, cut: [...cut].map(([homeserver, cursor]) => ({ homeserver, cursor })) };
    return modelOf(cutPart, ms, users, { homeservers: near.homeservers, runs });
  }

  /** Locks the pack, takes in what it holds, writes back the store's runs of its authors trimmed to `share`. */
  async function foldPack(path: string, shards: number, bucket: number, ms: MemberScopes, share: number) {
    const lock = await files.lock(path, limits.lockSeconds);
    try {
      const current = await readFile(path, isPackOf(shards, bucket));
      if (current === 'bad' || current === 'unsupported') throw new FoldRefused(path);
      if (current !== 'missing') await applyFiles([current.model]);
      const users = [...ms.members.keys()].filter((user) => bucketOf(user, shards) === bucket);
      const model = modelOf({ kind: 'pack', shards, bucket }, ms, users, await runsOf(ms, new Set(users)));
      const bytes = await writeFile(path, model, share, lock);
      return { bucket, bytes, authors: users.length, writtenAt: model.writtenAt };
    } finally {
      await files.unlock(lock).catch(() => undefined);
    }
  }

  /** The packs after this fold: 0 while the whole index fits in `hot`, doubled or halved as the mean pack grows. */
  function shardsAfter(shards: number, wholeBytes: number | null, packs: readonly IndexFilePack[], hotBytes: number) {
    if (shards === 0) {
      if (wholeBytes === null || wholeBytes <= limits.hotMaxBytes) return 0;
      let next = limits.firstShards;
      while (wholeBytes / next > limits.packSplitBytes) next *= 2;
      return next;
    }
    const total = packs.reduce((sum, { bytes }) => sum + bytes, 0);
    if (total + hotBytes <= limits.hotMaxBytes / 2) return 0;
    let next = shards;
    while (total / next > limits.packSplitBytes) next *= 2;
    if (next === shards && total / shards < limits.packMergeBytes && shards > limits.firstShards) next = shards / 2;
    return next;
  }

  /**
   * One fold, holding the lock on `hot` throughout so folds of the folder run one at a time. Takes in `hot`, every
   * other writer's delta and the version 2 files, writes each pack their authors fall in under its own lock, then
   * `hot`, then deletes what no file needs. The new base is the store's heads once everything was taken in: whatever
   * a commit adds after that goes into the next delta. `null` when another writer folds.
   */
  async function fold(state: SavedState): Promise<SavedState | null> {
    const f = await folderPath();
    let hotLock: IndexFileLock;
    try {
      hotLock = await files.lock(hotPath(f), limits.lockSeconds);
    } catch (error) {
      if (error instanceof IndexFileLockedError) return null;
      throw error;
    }
    let lockedAt = now();
    const keepLock = async () => {
      if (now() - lockedAt < limits.lockRefreshMs) return;
      await files.refresh(hotLock, limits.lockSeconds);
      lockedAt = now();
    };
    try {
      const hot = await readFile(hotPath(f), isHot);
      if (hot === 'bad' || hot === 'unsupported') throw new FoldRefused(hotPath(f));
      const listing = await files.list('');
      const deltaPaths = listing.filter((path) => path.startsWith(`${f}d/`) && path !== deltaPath(f, writer));
      const singlePaths = listing.filter((path) => SINGLE_FILE.test(path));
      const read = async (path: string, expected: (model: IndexFileModel<D>) => boolean) => {
        const result = await readFile(path, expected);
        return typeof result === 'object' ? [{ path, model: result.model }] : [];
      };
      const deltas = (await Promise.all(deltaPaths.map((path) => read(path, isDeltaAt(path))))).flat();
      const singles = (await Promise.all(singlePaths.map((path) => read(path, isSingleAt(path))))).flat();
      const previous = hot === 'missing' ? null : hot.model;
      const part = previous?.part.kind === 'hot' ? previous.part : null;
      const shared: Heads = { ...state.base };
      await applyFiles(
        [...(previous === null ? [] : [previous]), ...[...deltas, ...singles].map(({ model }) => model)],
        shared,
      );

      const folded = new Map((part?.folded ?? []).map(({ writer: who, gen }): [string, number] => [who, gen]));
      const ms = await memberScopes();
      const heads = await headsOf(ms.scopes);
      const touched = new Set<string>();
      for (const { model } of deltas) {
        if (model.part.kind === 'delta' && model.part.gen > (folded.get(model.writer) ?? 0)) {
          for (const { author } of model.runs) touched.add(author);
        }
      }
      for (const [id, [head, epoch]] of Object.entries(heads)) {
        const base = shared[id];
        if (base === undefined || base[0] !== head || base[1] !== epoch) touched.add((JSON.parse(id) as string[])[0]);
      }

      const shards = part?.shards ?? 0;
      const hotBytes = hot === 'missing' ? 0 : hot.bytes;
      const whole = shards === 0 ? await hotOf(ms, { kind: 'hot', shards: 0, folded: [], packs: [], cut: [] }) : null;
      const wholeBytes = whole === null ? null : (await encodeIndexFile(whole)).length;
      const next = shardsAfter(shards, wholeBytes, part?.packs ?? [], hotBytes);
      const reshard = next !== shards;
      const writers = deltaPaths.length + 1;
      const directory = new Map<number, IndexFilePack>(
        reshard ? [] : (part?.packs ?? []).map((pack): [number, IndexFilePack] => [pack.bucket, pack]),
      );
      if (reshard && shards > 0) {
        // The old packs go once `hot` names the new ones: take them in first.
        for (let bucket = 0; bucket < shards; bucket += 1) {
          await keepLock();
          const old = await readFile(packPath(f, shards, bucket), isPackOf(shards, bucket));
          if (old === 'bad' || old === 'unsupported') throw new FoldRefused(packPath(f, shards, bucket));
          if (old !== 'missing') await applyFiles([old.model]);
        }
      }
      if (next > 0) {
        const share = Math.floor((params.budget - hotBytes - limits.deltaMaxBytes * writers) / next);
        const everyPack = reshard || previous === null || singles.length > 0;
        const buckets = everyPack
          ? Array.from({ length: next }, (_, bucket) => bucket)
          : [...new Set([...touched].map((author) => bucketOf(author, next)))];
        for (const bucket of buckets.sort((a, b) => a - b)) {
          await keepLock();
          directory.set(bucket, await foldPack(packPath(f, next, bucket), next, bucket, ms, share));
        }
      }

      for (const { model } of deltas) {
        if (model.part.kind === 'delta')
          folded.set(model.writer, Math.max(folded.get(model.writer) ?? 0, model.part.gen));
      }
      if (state.gen > 0) folded.set(writer, Math.max(folded.get(writer) ?? 0, state.gen));
      const hotPart: Extract<IndexFilePart, { kind: 'hot' }> = {
        kind: 'hot',
        shards: next,
        folded: [...folded].map(([who, gen]) => ({ writer: who, gen })).sort((a, b) => (a.writer < b.writer ? -1 : 1)),
        packs: [...directory.values()].sort((a, b) => a.bucket - b.bucket),
        cut: [],
      };
      const model = next === 0 && whole !== null ? { ...whole, part: hotPart } : await hotOf(ms, hotPart);
      await keepLock();
      await writeFile(hotPath(f), model, next === 0 ? params.budget - limits.deltaMaxBytes * writers : null, hotLock);

      // Each deletion removes only what the files written above hold, or what a crawl can read again.
      const stale = [
        ...listing.filter((path) => path.startsWith(`${f}p/`) && (next === 0 || !path.startsWith(`${f}p/${next}/`))),
        ...singles.map(({ path }) => path),
        ...deltas.flatMap(({ path, model: delta }) =>
          delta.part.kind === 'delta' &&
          delta.part.gen <= (folded.get(delta.writer) ?? 0) &&
          now() - delta.writtenAt > params.expiryMs
            ? [path]
            : [],
        ),
      ];
      for (const path of stale) await files.delete(path).catch(() => undefined);
      const packs: Record<string, number> = {};
      for (const pack of directory.values()) packs[packPath(f, next, pack.bucket)] = pack.writtenAt;
      return { ...state, baseGen: state.gen, since: null, base: heads, sent: {}, packs };
    } finally {
      await files.unlock(hotLock).catch(() => undefined);
    }
  }

  return {
    async load(onChange) {
      const f = await folderPath();
      const state = await readState();
      const base: Heads = { ...state.base };
      const [hot, deltaPaths] = await Promise.all([readFile(hotPath(f), isHot), files.list(`${f}d/`)]);
      const singlePaths = hot === 'missing' ? (await files.list('')).filter((path) => SINGLE_FILE.test(path)) : [];
      const reads = await Promise.all([
        ...deltaPaths.map((path) => readFile(path, isDeltaAt(path))),
        ...singlePaths.map((path) => readFile(path, isSingleAt(path))),
      ]);
      const first = [hot, ...reads].flatMap((result) => (typeof result === 'object' ? [result.model] : []));
      let ignored = [hot, ...reads].filter((result) => result === 'bad' || result === 'unsupported').length;
      const outcome = await applyFiles(first, base);
      ignored += outcome.refused;
      let loaded = outcome.applied.length;
      let writtenAt = outcome.applied.reduce<number | null>((at, { writtenAt: w }) => Math.max(at ?? w, w), null);
      const scopes = new Map(outcome.change.scopes.map((scope) => [scopeId(scope), scope]));
      if (outcome.change.scopes.length > 0 || outcome.change.seeds.length > 0) onChange(outcome.change);

      const part = typeof hot === 'object' && hot.model.part.kind === 'hot' ? hot.model.part : null;
      const packs: Record<string, number> = { ...state.packs };
      let failure: unknown = null;
      const due = (part?.packs ?? []).filter(
        ({ bucket, writtenAt: at }) => (state.packs[packPath(f, part?.shards ?? 0, bucket)] ?? -1) < at,
      );
      let taken = 0;
      const worker = async () => {
        while (part !== null && taken < due.length) {
          const { bucket, writtenAt: at } = due[taken];
          taken += 1;
          const path = packPath(f, part.shards, bucket);
          try {
            const pack = await readFile(path, isPackOf(part.shards, bucket));
            if (pack === 'missing') continue;
            if (pack === 'bad' || pack === 'unsupported') {
              ignored += 1;
              continue;
            }
            const applied = await applyFiles([pack.model], base);
            ignored += applied.refused;
            loaded += applied.applied.length;
            packs[path] = at;
            writtenAt = Math.max(writtenAt ?? pack.model.writtenAt, pack.model.writtenAt);
            for (const scope of applied.change.scopes) scopes.set(scopeId(scope), scope);
            if (applied.change.scopes.length > 0) onChange(applied.change);
          } catch (error) {
            failure ??= error;
          }
        }
      };
      await Promise.all(Array.from({ length: PACK_READS }, worker));

      const mine = part?.folded.find(({ writer: who }) => who === writer);
      const rebased = mine !== undefined && state.gen > 0 && mine.gen >= state.gen;
      await writeState({
        ...state,
        base: rebased ? higherHeads(base, state.sent) : base,
        ...(rebased ? { baseGen: state.gen, since: null, sent: {} } : {}),
        packs,
      });
      foldWanted = hot === 'missing' || singlePaths.length > 0;
      if (failure !== null) throw failure;
      return { loaded, ignored, change: { scopes: [...scopes.values()], seeds: outcome.change.seeds }, writtenAt };
    },

    async flush(mayFold) {
      const state = await readState();
      const ms = await memberScopes();
      const delta = await deltaOf(state, ms);
      const bytes = delta.model.runs.length === 0 ? null : await encodeIndexFile(delta.model);
      const due =
        foldWanted ||
        (bytes !== null && bytes.length > limits.deltaFoldBytes) ||
        (state.since !== null && now() - state.since >= limits.foldAgeMs);
      if (mayFold && due) {
        let folded: SavedState | null = null;
        try {
          folded = await fold(state);
        } catch (error) {
          // Whatever stopped it, a lock, a file this device cannot read, a failed request: the delta keeps the changes.
          if (error instanceof IndexerAbortedError) throw error;
        }
        if (folded !== null) {
          await writeState(folded);
          foldWanted = false;
          return 'folded';
        }
      }
      if (bytes === null) return 'unchanged';
      const sent = higherHeads(state.base, delta.heads);
      // The delta on the homeserver already carries these heads: a commit of something else changed nothing here.
      if (state.gen > 0 && sameHeads(sent, state.sent)) return 'unchanged';
      const path = deltaPath(await folderPath(), writer);
      await files.write(path, sealer === undefined ? bytes : await sealer.seal(bytes, path));
      await writeState({
        ...state,
        gen: state.gen + 1,
        since: state.since ?? now(),
        sent,
      });
      return 'delta';
    },
  };
}
