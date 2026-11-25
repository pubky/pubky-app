import { formatCursor, parseCursor } from './cursor';
import { shortHash } from './hash';
import { IndexerError } from './indexer.errors';
import type { Cursor, Entry, RecordEntry, Run } from './indexer.types';
import { validateRun } from './run';
import type { HighWater, UserHomeserver } from './store.types';

// The saved index: one gzipped JSON file per writer, positional and compact. Layout, version 2:
// [version, writer, writtenAt, seed, hops, windowDays, keys, members, highWater, runs]
// Every public key is written once in `keys`; everywhere else a key is its index there.
//   members:   [user, hop] or [user, hop, homeserver | null, resolvedAt] once the user was resolved
//   highWater: [homeserver, cursor, author]
//   runs:      [author, homeserver, group, tail, head, prefix, entries]
//   entries:   [path after the prefix, cursor, 1] for a tombstone, [path, cursor, 0, hash?] for a record without data,
//              [path, cursor, 0, hash | null, data] for one with its data
// Cursors are decimal strings. A record without data keeps the first 16 bytes of its hash, one with data the whole
// hash, which ties the data to its event. Version 1 is the same without data, and is still read.

export const INDEX_FILE_VERSION = 2;
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

/**
 * What a saved index holds. Read back, a record keeps its data only through `ReviveData`, and a record without data has
 * its hash cut to 16 bytes.
 */
export interface IndexFileModel<D = never> {
  /** The writer id, also the file's name. */
  writer: string;
  /** When it was written (ms). */
  writtenAt: number;
  seed: string;
  hops: number;
  windowDays: number;
  members: IndexFileMember[];
  highWater: Array<{ homeserver: string; highWater: HighWater }>;
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
  const highWater = model.highWater.map(({ homeserver, highWater: { cursor, author } }) => [
    key(homeserver),
    formatCursor(cursor),
    key(author),
  ]);
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
  return [
    INDEX_FILE_VERSION,
    model.writer,
    model.writtenAt,
    seed,
    model.hops,
    model.windowDays,
    keys,
    members,
    highWater,
    runs,
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

function parseModel<D>(top: unknown, revive: ReviveData<D> | undefined): IndexFileModel<D> {
  const fields = array(top, 'the file');
  if (fields.length === 0 || typeof fields[0] !== 'number') fail('the file has no version');
  const version = fields[0];
  if (version !== INDEX_FILE_VERSION && version !== POINTERS_ONLY_VERSION) {
    throw new IndexFileError('unknown-version', `index file version ${version} is not supported`);
  }
  const [, rawWriter, rawWrittenAt, rawSeed, rawHops, rawWindowDays, rawKeys, rawMembers, rawHighWater, rawRuns] =
    tuple(fields, [10], 'the file');

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

  const homeservers = new Set<string>();
  const highWater = array(rawHighWater, 'highWater').map((value, i) => {
    const [rawHomeserver, rawCursor, rawAuthor] = tuple(value, [3], `high water ${i}`);
    const homeserver = key(rawHomeserver, `high water ${i} homeserver`);
    if (homeservers.has(homeserver)) fail(`high water of ${homeserver} repeats`);
    homeservers.add(homeserver);
    return {
      homeserver,
      highWater: { cursor: cursor(rawCursor, `high water ${i} cursor`), author: key(rawAuthor, `high water ${i}`) },
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
    writer,
    writtenAt: count(rawWrittenAt, 'writtenAt'),
    seed: key(rawSeed, 'seed'),
    hops: count(rawHops, 'hops'),
    windowDays,
    members,
    highWater,
    runs,
  };
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
