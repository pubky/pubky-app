import { formatCursor, parseCursor } from './cursor';
import { countedEpoch, type Epoch, isEpoch } from './epoch';
import { shortHash } from './hash';
import { IndexerError, InvalidIndexInputError } from './indexer.errors';
import type { Cursor, Entry, RecordEntry, Run } from './indexer.types';
import { validateRun } from './run';
import type { HighWater, UserHomeserver } from './store.types';

// A saved index file: gzipped JSON, positional and compact. Layout, version 3:
// [3, kind, writer, writtenAt, seed, hops, windowDays, keys, members, homeservers, runs, extra]
// Every public key is written once in `keys`; everywhere else a key is its index there.
//   kind:        "hot", "pack" or "delta", the file's part of the saved index (`savedIndex.ts`)
//   members:     [user, hop] or [user, hop, homeserver | null, resolvedAt] once the user was resolved
//   homeservers: [homeserver, epoch] or [homeserver, epoch, cursor, author] with its high-water mark
//   runs:        [author, homeserver, group, tail, head, prefix, entries]
//   entries:     [path after the prefix, cursor, 1] for a tombstone, [path, cursor, 0, hash?] for a record without
//                data, [path, cursor, 0, hash | null, data] for one with its data
//   extra:       hot   [shards, folded [[writer, gen]], packs [[bucket, bytes, authors, writtenAt]], cut [[homeserver,
//                       cursor]]]
//                pack  [shards, bucket]
//                delta [gen, base]
// Cursors are decimal strings. A record without data keeps the first 16 bytes of its hash, one with data the whole
// hash, which ties the data to its event. An epoch names the homeserver's log the runs were read from (`epoch.ts`);
// earlier files of this version wrote a count, read as the counted epoch. Version 2 is one file per writer, written
// by earlier releases: [2, writer, writtenAt, seed, hops, windowDays, keys, members, highWater, runs] with highWater
// rows [homeserver, cursor, author], read as counted epoch 0. Version 1 is version 2 without data. Both are still read.

export const INDEX_FILE_VERSION = 3;
const SINGLE_FILE_VERSION = 2;
const POINTERS_ONLY_VERSION = 1;

const RECORD = 0;
const TOMBSTONE = 1;
const WRITER = /^[A-Za-z0-9_-]{1,64}$/;

export type IndexFileErrorCode = 'unavailable' | 'malformed' | 'unknown-version';

export class IndexFileError extends IndexerError {
  readonly code: IndexFileErrorCode;

  constructor(code: IndexFileErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IndexFileError';
    this.code = code;
  }
}

/** A scope member, with the homeserver it resolved to when it was resolved. */
export interface IndexFileMember {
  user: string;
  hop: number;
  homeserver: UserHomeserver | null;
}

/** A homeserver the file's runs were read from: the log they were read from, and its high-water mark. */
export interface IndexFileHomeserver {
  homeserver: string;
  epoch: Epoch;
  highWater: HighWater | null;
}

/** A pack the hot file's directory records, as of its last write. */
export interface IndexFilePack {
  bucket: number;
  bytes: number;
  authors: number;
  writtenAt: number;
}

/** Which part of the saved index a file is. `single` is a version 1 or 2 file, one per writer. */
export type IndexFilePart =
  | {
      kind: 'hot';
      /** Packs the authors are spread over, 0 while this file holds the whole index. */
      shards: number;
      /** Per writer, the newest generation of its delta folded into this file and the packs. */
      folded: Array<{ writer: string; gen: number }>;
      packs: IndexFilePack[];
      /** Per homeserver, the cursor above which this file keeps the activity of hops 0 and 1, when it is cut. */
      cut: Array<{ homeserver: string; cursor: Cursor }>;
    }
  | { kind: 'pack'; shards: number; bucket: number }
  | { kind: 'delta'; gen: number; base: number }
  | { kind: 'single' };

/**
 * What a saved index file holds. Read back, a record keeps its data only through `ReviveData`, and a record without
 * data has its hash cut to 16 bytes.
 */
export interface IndexFileModel<D = never> {
  part: IndexFilePart;
  /** Who wrote it last; a delta's or a single file's writer also names it. */
  writer: string;
  /** When it was written (ms). */
  writtenAt: number;
  seed: string;
  hops: number;
  windowDays: number;
  members: IndexFileMember[];
  homeservers: IndexFileHomeserver[];
  /** Only the domain's groups of the members, never anything loaded on demand. */
  runs: Run<D>[];
}

/** Checks a stored payload on reading, `null` to refuse it: the record then loads without data. Never throws. */
export type ReviveData<D> = (author: string, path: string, value: unknown) => D | null;

/** A writer id the file format accepts, also a valid file name segment. */
export const isWriterId = (value: string): boolean => WRITER.test(value);

function streams(): { gzip: () => CompressionStream; gunzip: () => DecompressionStream } {
  if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
    throw new IndexFileError('unavailable', 'this runtime has no CompressionStream');
  }
  return { gzip: () => new CompressionStream('gzip'), gunzip: () => new DecompressionStream('gzip') };
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const written = writer.write(new Uint8Array(bytes)).then(() => writer.close());
  // A broken input rejects the read below too, which reports it.
  written.catch(() => undefined);
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
  }
  await written;
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function commonPrefix(paths: readonly string[]): string {
  if (paths.length < 2) return '';
  let prefix = paths[0];
  for (const path of paths) {
    let i = 0;
    while (i < prefix.length && i < path.length && prefix[i] === path[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

/** The positional JSON value of a model, before compression. */
export function indexFileJson<D>(model: IndexFileModel<D>): unknown[] {
  const keys: string[] = [];
  const indexOf = new Map<string, number>();
  const key = (value: string) => {
    const known = indexOf.get(value);
    if (known !== undefined) return known;
    indexOf.set(value, keys.length);
    keys.push(value);
    return keys.length - 1;
  };
  const seed = key(model.seed);
  const members = model.members.map(({ user, hop, homeserver }) =>
    homeserver === null
      ? [key(user), hop]
      : [key(user), hop, homeserver.homeserver === null ? null : key(homeserver.homeserver), homeserver.resolvedAt],
  );
  const homeservers = model.homeservers.map(({ homeserver, epoch, highWater }) =>
    highWater === null
      ? [key(homeserver), epoch]
      : [key(homeserver), epoch, formatCursor(highWater.cursor), key(highWater.author)],
  );
  const runs = model.runs.map((run) => {
    const prefix = commonPrefix(run.entries.map(({ path }) => path));
    const entries = run.entries.map((entry) => {
      const fields: unknown[] = [entry.path.slice(prefix.length), formatCursor(entry.cursor)];
      if (entry.kind === 'tombstone') fields.push(TOMBSTONE);
      else if (entry.data !== undefined) fields.push(RECORD, entry.hash ?? null, entry.data);
      else {
        fields.push(RECORD);
        if (entry.hash !== undefined) fields.push(shortHash(entry.hash));
      }
      return fields;
    });
    return [
      key(run.author),
      key(run.homeserver),
      run.group,
      formatCursor(run.tail),
      formatCursor(run.head),
      prefix,
      entries,
    ];
  });
  const { part } = model;
  if (part.kind === 'single') throw new InvalidIndexInputError('version 2 files are only read');
  const extra =
    part.kind === 'hot'
      ? [
          part.shards,
          part.folded.map(({ writer, gen }) => [writer, gen]),
          part.packs.map(({ bucket, bytes, authors, writtenAt }) => [bucket, bytes, authors, writtenAt]),
          part.cut.map(({ homeserver, cursor }) => [key(homeserver), formatCursor(cursor)]),
        ]
      : part.kind === 'pack'
        ? [part.shards, part.bucket]
        : [part.gen, part.base];
  return [
    INDEX_FILE_VERSION,
    part.kind,
    model.writer,
    model.writtenAt,
    seed,
    model.hops,
    model.windowDays,
    keys,
    members,
    homeservers,
    runs,
    extra,
  ];
}

/** The file's bytes: gzip of the UTF-8 JSON. */
export async function encodeIndexFile<D>(model: IndexFileModel<D>): Promise<Uint8Array> {
  const { gzip } = streams();
  return transform(new TextEncoder().encode(JSON.stringify(indexFileJson(model))), gzip());
}

class Malformed extends Error {}

function fail(message: string): never {
  throw new Malformed(message);
}

function array(value: unknown, what: string): unknown[] {
  return Array.isArray(value) ? value : fail(`${what} is not an array`);
}

function tuple(value: unknown, lengths: readonly number[], what: string): unknown[] {
  const items = array(value, what);
  return lengths.includes(items.length) ? items : fail(`${what} has ${items.length} fields`);
}

function string(value: unknown, what: string): string {
  return typeof value === 'string' ? value : fail(`${what} is not a string`);
}

function count(value: unknown, what: string): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fail(`${what} is not a non-negative integer`);
}

function cursor(value: unknown, what: string): Cursor {
  try {
    return parseCursor(string(value, what));
  } catch {
    return fail(`${what} is not a cursor`);
  }
}

/** Shards are 0 or a power of two. */
const isShards = (value: number) => value === 0 || (value & (value - 1)) === 0;

function parseModel<D>(top: unknown, revive: ReviveData<D> | undefined): IndexFileModel<D> {
  const fields = array(top, 'the file');
  if (fields.length === 0 || typeof fields[0] !== 'number') fail('the file has no version');
  const version = fields[0];
  if (version !== INDEX_FILE_VERSION && version !== SINGLE_FILE_VERSION && version !== POINTERS_ONLY_VERSION) {
    throw new IndexFileError('unknown-version', `index file version ${version} is not supported`);
  }
  const single = version !== INDEX_FILE_VERSION;
  // Version 3 adds the kind after the version and the extra at the end.
  const [
    rawKind,
    rawWriter,
    rawWrittenAt,
    rawSeed,
    rawHops,
    rawWindowDays,
    rawKeys,
    rawMembers,
    rawHomeservers,
    rawRuns,
  ] = single ? ['single', ...tuple(fields, [10], 'the file').slice(1)] : tuple(fields, [12], 'the file').slice(1);

  const writer = string(rawWriter, 'writer');
  if (!isWriterId(writer)) fail('writer is not a writer id');
  const keys = array(rawKeys, 'keys').map((value, i) => {
    const text = string(value, `key ${i}`);
    return text.length > 0 ? text : fail(`key ${i} is empty`);
  });
  if (new Set(keys).size !== keys.length) fail('keys repeat');
  const key = (value: unknown, what: string): string => {
    const index = count(value, what);
    return index < keys.length ? keys[index] : fail(`${what} is not a key index`);
  };
  const windowDays = rawWindowDays;
  if (typeof windowDays !== 'number' || !Number.isFinite(windowDays) || windowDays < 0) {
    fail('windowDays is not a non-negative number');
  }

  const users = new Set<string>();
  const members = array(rawMembers, 'members').map((value, i): IndexFileMember => {
    const member = tuple(value, [2, 4], `member ${i}`);
    const user = key(member[0], `member ${i} user`);
    if (users.has(user)) fail(`member ${user} repeats`);
    users.add(user);
    const hop = count(member[1], `member ${i} hop`);
    if (member.length === 2) return { user, hop, homeserver: null };
    const homeserver = member[2] === null ? null : key(member[2], `member ${i} homeserver`);
    return { user, hop, homeserver: { homeserver, resolvedAt: count(member[3], `member ${i} resolvedAt`) } };
  });

  const seen = new Set<string>();
  const homeservers = array(rawHomeservers, 'homeservers').map((value, i): IndexFileHomeserver => {
    const what = `homeserver ${i}`;
    let row: unknown[];
    if (single) {
      const [rawHomeserver, rawCursor, rawAuthor] = tuple(value, [3], what);
      row = [rawHomeserver, countedEpoch(0), rawCursor, rawAuthor];
    } else row = tuple(value, [2, 4], what);
    const homeserver = key(row[0], `${what} key`);
    if (seen.has(homeserver)) fail(`homeserver ${homeserver} repeats`);
    seen.add(homeserver);
    const epoch =
      typeof row[1] === 'number' ? countedEpoch(count(row[1], `${what} epoch`)) : string(row[1], `${what} epoch`);
    if (!isEpoch(epoch)) fail(`${what} epoch is not one`);
    if (row.length === 2) return { homeserver, epoch, highWater: null };
    return {
      homeserver,
      epoch,
      highWater: { cursor: cursor(row[2], `${what} cursor`), author: key(row[3], `${what} author`) },
    };
  });

  const entryLengths = version === POINTERS_ONLY_VERSION ? [3, 4] : [3, 4, 5];
  const runs = array(rawRuns, 'runs').map((value, i): Run<D> => {
    const what = `run ${i}`;
    const [rawAuthor, rawHomeserver, rawGroup, rawTail, rawHead, rawPrefix, rawEntries] = tuple(value, [7], what);
    const author = key(rawAuthor, `${what} author`);
    const group = string(rawGroup, `${what} group`);
    if (group.length === 0) fail(`${what} group is empty`);
    const prefix = string(rawPrefix, `${what} prefix`);
    const entries = array(rawEntries, `${what} entries`).map((item, j): Entry<D> => {
      const at = `${what} entry ${j}`;
      const entry = tuple(item, entryLengths, at);
      const path = `${prefix}${string(entry[0], `${at} path`)}`;
      const entryCursor = cursor(entry[1], `${at} cursor`);
      if (entry[2] === TOMBSTONE && entry.length === 3) return { kind: 'tombstone', path, cursor: entryCursor };
      if (entry[2] !== RECORD) fail(`${at} has no valid kind`);
      const record: RecordEntry<D> = { kind: 'record', path, cursor: entryCursor };
      if (entry.length === 3) return record;
      if (entry.length === 4 || entry[3] !== null) record.hash = string(entry[3], `${at} hash`);
      const data = entry.length === 5 ? reviveSafely(revive, author, path, entry[4]) : null;
      if (data !== null) record.data = data;
      return record;
    });
    const run: Run<D> = {
      author,
      homeserver: key(rawHomeserver, `${what} homeserver`),
      group,
      tail: cursor(rawTail, `${what} tail`),
      head: cursor(rawHead, `${what} head`),
      entries,
    };
    const violations = validateRun(run);
    if (violations.length > 0) fail(`${what} is invalid: ${violations.join('; ')}`);
    return run;
  });

  return {
    part: single ? { kind: 'single' } : parsePart(rawKind, fields[11], key),
    writer,
    writtenAt: count(rawWrittenAt, 'writtenAt'),
    seed: key(rawSeed, 'seed'),
    hops: count(rawHops, 'hops'),
    windowDays,
    members,
    homeservers,
    runs,
  };
}

function parsePart(rawKind: unknown, rawExtra: unknown, key: (value: unknown, what: string) => string): IndexFilePart {
  const kind = string(rawKind, 'kind');
  if (kind === 'pack') {
    const [rawShards, rawBucket] = tuple(rawExtra, [2], 'pack extra');
    const shards = count(rawShards, 'shards');
    const bucket = count(rawBucket, 'bucket');
    if (shards === 0 || !isShards(shards) || bucket >= shards) fail('pack bucket is not one of its shards');
    return { kind, shards, bucket };
  }
  if (kind === 'delta') {
    const [rawGen, rawBase] = tuple(rawExtra, [2], 'delta extra');
    return { kind, gen: count(rawGen, 'gen'), base: count(rawBase, 'base') };
  }
  if (kind !== 'hot') fail(`kind ${kind} is not one of hot, pack, delta`);
  const [rawShards, rawFolded, rawPacks, rawCut] = tuple(rawExtra, [4], 'hot extra');
  const shards = count(rawShards, 'shards');
  if (!isShards(shards)) fail('shards is not 0 or a power of two');
  const writers = new Set<string>();
  const folded = array(rawFolded, 'folded').map((value, i) => {
    const [rawWriter, rawGen] = tuple(value, [2], `folded ${i}`);
    const writer = string(rawWriter, `folded ${i} writer`);
    if (!isWriterId(writer) || writers.has(writer)) fail(`folded ${i} writer is not a new writer id`);
    writers.add(writer);
    return { writer, gen: count(rawGen, `folded ${i} gen`) };
  });
  const buckets = new Set<number>();
  const packs = array(rawPacks, 'packs').map((value, i): IndexFilePack => {
    const [rawBucket, rawBytes, rawAuthors, rawWrittenAt] = tuple(value, [4], `pack ${i}`);
    const bucket = count(rawBucket, `pack ${i} bucket`);
    if (bucket >= shards || buckets.has(bucket)) fail(`pack ${i} bucket is not a new one of the shards`);
    buckets.add(bucket);
    return {
      bucket,
      bytes: count(rawBytes, `pack ${i} bytes`),
      authors: count(rawAuthors, `pack ${i} authors`),
      writtenAt: count(rawWrittenAt, `pack ${i} writtenAt`),
    };
  });
  const cutAt = new Set<string>();
  const cut = array(rawCut, 'cut').map((value, i) => {
    const [rawHomeserver, rawCursor] = tuple(value, [2], `cut ${i}`);
    const homeserver = key(rawHomeserver, `cut ${i} homeserver`);
    if (cutAt.has(homeserver)) fail(`cut of ${homeserver} repeats`);
    cutAt.add(homeserver);
    return { homeserver, cursor: cursor(rawCursor, `cut ${i} cursor`) };
  });
  return { kind, shards, folded, packs, cut };
}

/** The revived payload, `null` without a reviver or when it refuses or throws. */
function reviveSafely<D>(revive: ReviveData<D> | undefined, author: string, path: string, value: unknown): D | null {
  if (revive === undefined) return null;
  try {
    return revive(author, path, value);
  } catch {
    return null;
  }
}

/**
 * Reads a saved index, which any program may have written: everything is checked, and anything malformed throws
 * `IndexFileError` with code `malformed`, an unknown format version with code `unknown-version`. Stored payloads
 * pass through `revive`, and without it are dropped.
 */
export async function decodeIndexFile<D = never>(
  bytes: Uint8Array,
  revive?: ReviveData<D>,
): Promise<IndexFileModel<D>> {
  const { gunzip } = streams();
  let top: unknown;
  try {
    top = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await transform(bytes, gunzip())));
  } catch (error) {
    throw new IndexFileError('malformed', 'the index file is not gzipped UTF-8 JSON', { cause: error });
  }
  try {
    return parseModel(top, revive);
  } catch (error) {
    if (error instanceof Malformed) throw new IndexFileError('malformed', `malformed index file: ${error.message}`);
    throw error;
  }
}
