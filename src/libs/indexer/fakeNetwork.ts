import { CURSOR_ZERO } from './cursor';
import {
  HomeserverUnreachableError,
  IndexFileLockedError,
  IndexFileLockLostError,
  InvalidIndexInputError,
  RateLimitedError,
} from './indexer.errors';
import type { Cursor, StreamEvent } from './indexer.types';
import { comparePaths } from './run';
import type {
  AuthoredStreamEvent,
  GetPublicRequest,
  IndexerTransport,
  IndexFileLock,
  IndexFiles,
  ReadEventsRequest,
} from './transport.types';

// Test-only: a scripted set of homeservers with the event stream semantics the crawler relies on.

export const MAX_USERS_PER_REQUEST = 50;
export const MAX_LIMIT = 1000;

/** FNV-1a over the bytes: deterministic, enough to tell two contents apart in tests. */
export function contentHash(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return `fnv:${hash.toString(16)}`;
}

export const encodeJson = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

interface FakeHomeserver {
  log: AuthoredStreamEvent[];
  next: number;
  /** Bytes served per `author\u0000path`; absent means 404. */
  files: Map<string, Uint8Array>;
  down: boolean;
  rateLimits: number;
  retryAfterMs?: number;
}

/** One `readEvents` call as the fake saw it. */
export interface ReadLogEntry {
  homeserver: string;
  users: string[];
  reverse: boolean;
  events: AuthoredStreamEvent[];
}

const fileKey = (author: string, path: string) => `${author}\u0000${path}`;

/** Longest lock the homeserver grants, whatever is asked. */
const MAX_LOCK_SECONDS = 60;

class FakeLock implements IndexFileLock {
  constructor(
    readonly path: string,
    readonly token: number,
  ) {}
}

/** One request to the index folder as the fake saw it. */
export interface IndexFileRequest {
  op: 'list' | 'read' | 'write' | 'delete' | 'lock' | 'refresh' | 'unlock';
  path: string;
  /** Bytes sent or received. */
  bytes: number;
}

/**
 * Test-only: one user's index folder with the homeserver's semantics: a PUT replaces a file whole, and an exclusive
 * lock that expires on `now` refuses every write that does not present it (423) and every write presenting it once
 * it is gone (412). `fault`, when set, runs before each request and fails it by throwing, as a crash or a network
 * error does.
 */
export class FakeIndexFiles implements IndexFiles {
  readonly files = new Map<string, Uint8Array>();
  readonly requests: IndexFileRequest[] = [];
  now: () => number = () => 0;
  fault: ((request: Omit<IndexFileRequest, 'bytes'>) => void) | null = null;
  /** Off, as on a homeserver without locks: every lock is granted and no write is refused. */
  locking = true;
  private readonly locks = new Map<string, { token: number; expiresAt: number }>();
  private nextToken = 1;

  /** This folder with some calls replaced, for a transport that wraps them. */
  with(overrides: Partial<IndexFiles>): IndexFiles {
    return {
      list: (prefix) => this.list(prefix),
      read: (path) => this.read(path),
      write: (path, bytes, lock) => this.write(path, bytes, lock),
      delete: (path, lock) => this.delete(path, lock),
      lock: (path, seconds) => this.lock(path, seconds),
      refresh: (lock, seconds) => this.refresh(lock, seconds),
      unlock: (lock) => this.unlock(lock),
      ...overrides,
    };
  }

  /** Expires the lock on `path` at once, as a holder that paused past its lifetime finds it. */
  expire(path: string): void {
    this.locks.delete(path);
  }

  locked(path: string): boolean {
    return this.live(path) !== undefined;
  }

  async list(prefix: string): Promise<string[]> {
    this.enter('list', prefix);
    const paths = [...this.files.keys()].filter((path) => path.startsWith(prefix)).sort();
    this.requests.push({ op: 'list', path: prefix, bytes: 0 });
    return paths;
  }

  async read(path: string): Promise<Uint8Array | null> {
    this.enter('read', path);
    const bytes = this.files.get(path);
    this.requests.push({ op: 'read', path, bytes: bytes?.length ?? 0 });
    return bytes?.slice() ?? null;
  }

  async write(path: string, bytes: Uint8Array, lock?: IndexFileLock): Promise<void> {
    this.enter('write', path);
    this.admit(path, lock);
    this.files.set(path, bytes.slice());
    this.requests.push({ op: 'write', path, bytes: bytes.length });
  }

  async delete(path: string, lock?: IndexFileLock): Promise<void> {
    this.enter('delete', path);
    this.admit(path, lock);
    this.files.delete(path);
    this.requests.push({ op: 'delete', path, bytes: 0 });
  }

  async lock(path: string, seconds: number): Promise<IndexFileLock> {
    this.enter('lock', path);
    if (this.live(path) !== undefined) throw new IndexFileLockedError(path);
    const token = this.nextToken;
    this.nextToken += 1;
    this.locks.set(path, { token, expiresAt: this.now() + Math.min(seconds, MAX_LOCK_SECONDS) * 1000 });
    this.requests.push({ op: 'lock', path, bytes: 0 });
    return new FakeLock(path, token);
  }

  async refresh(lock: IndexFileLock, seconds: number): Promise<void> {
    this.enter('refresh', lock.path);
    if (!this.locking) return;
    const held = this.live(lock.path);
    if (held === undefined || !(lock instanceof FakeLock) || held.token !== lock.token) {
      throw new IndexFileLockLostError(lock.path);
    }
    held.expiresAt = this.now() + Math.min(seconds, MAX_LOCK_SECONDS) * 1000;
    this.requests.push({ op: 'refresh', path: lock.path, bytes: 0 });
  }

  async unlock(lock: IndexFileLock): Promise<void> {
    this.enter('unlock', lock.path);
    const held = this.live(lock.path);
    if (held !== undefined && lock instanceof FakeLock && held.token === lock.token) this.locks.delete(lock.path);
    this.requests.push({ op: 'unlock', path: lock.path, bytes: 0 });
  }

  private enter(op: IndexFileRequest['op'], path: string): void {
    this.fault?.({ op, path });
  }

  private live(path: string) {
    if (!this.locking) return undefined;
    const held = this.locks.get(path);
    if (held !== undefined && held.expiresAt <= this.now()) this.locks.delete(path);
    return this.locks.get(path);
  }

  private admit(path: string, lock: IndexFileLock | undefined): void {
    if (!this.locking) return;
    const held = this.live(path);
    if (lock === undefined) {
      if (held !== undefined) throw new IndexFileLockedError(path);
      return;
    }
    if (held === undefined || !(lock instanceof FakeLock) || held.token !== lock.token) {
      throw new IndexFileLockLostError(path);
    }
  }
}
const copyEvent = (event: AuthoredStreamEvent): AuthoredStreamEvent => ({ ...event });

export class FakeNetwork implements IndexerTransport {
  readonly reads: ReadLogEntry[] = [];
  private readonly homeservers = new Map<string, FakeHomeserver>();
  private readonly homeserverOf = new Map<string, string>();
  readonly indexFiles = new FakeIndexFiles();

  addHomeserver(homeserver: string): this {
    this.homeservers.set(homeserver, { log: [], next: 1, files: new Map(), down: false, rateLimits: 0 });
    return this;
  }

  addUser(user: string, homeserver: string): this {
    this.server(homeserver);
    this.homeserverOf.set(user, homeserver);
    return this;
  }

  put(user: string, path: string, bytes: Uint8Array = encodeJson(path)): Cursor {
    const server = this.server(this.homeserverOfUser(user));
    server.files.set(fileKey(user, path), bytes);
    return this.append(server, { type: 'PUT', path, author: user, hash: contentHash(bytes) });
  }

  putJson(user: string, path: string, value: unknown): Cursor {
    return this.put(user, path, encodeJson(value));
  }

  del(user: string, path: string): Cursor {
    const server = this.server(this.homeserverOfUser(user));
    server.files.delete(fileKey(user, path));
    return this.append(server, { type: 'DEL', path, author: user });
  }

  /** Serves other bytes for a path, or a 404 with `null`, without an event: a write racing the crawler. */
  overrideFile(user: string, path: string, bytes: Uint8Array | null): void {
    const server = this.server(this.homeserverOfUser(user));
    if (bytes === null) server.files.delete(fileKey(user, path));
    else server.files.set(fileKey(user, path), bytes);
  }

  setDown(homeserver: string, down: boolean): void {
    this.server(homeserver).down = down;
  }

  /** The next `times` calls to the homeserver answer 429. */
  rateLimit(homeserver: string, times: number, retryAfterMs?: number): void {
    const server = this.server(homeserver);
    server.rateLimits = times;
    server.retryAfterMs = retryAfterMs;
  }

  /**
   * Rebuilds the homeserver from its files, as a restore from backup does: one PUT per file, numbered from 1,
   * so every cursor is below the old ones and the deletes are gone.
   */
  restore(homeserver: string): void {
    const server = this.server(homeserver);
    const latest = new Map<string, AuthoredStreamEvent>();
    for (const event of server.log) latest.set(fileKey(event.author, event.path), event);
    server.log = [];
    server.next = 1;
    for (const event of latest.values()) {
      if (event.type === 'PUT') {
        this.append(server, { type: 'PUT', path: event.path, author: event.author, hash: event.hash });
      }
    }
  }

  /** The newest cursor of the homeserver's log, zero when empty. */
  headOf(homeserver: string): Cursor {
    const { log } = this.server(homeserver);
    return log.length === 0 ? CURSOR_ZERO : log[log.length - 1].cursor;
  }

  /** The last event of each of the user's paths under `prefixes` with a cursor above `after`, and up to `upTo`. */
  lastEvents(
    user: string,
    prefixes: readonly string[],
    after: Cursor = CURSOR_ZERO,
    upTo: Cursor | null = null,
  ): Map<string, StreamEvent> {
    const last = new Map<string, StreamEvent>();
    for (const event of this.server(this.homeserverOfUser(user)).log) {
      if (event.author !== user || event.cursor <= after || (upTo !== null && event.cursor > upTo)) continue;
      if (!prefixes.some((prefix) => event.path.startsWith(prefix))) continue;
      const { author: _author, ...plain } = event;
      last.set(event.path, plain);
    }
    return last;
  }

  /** What a full index serves for the user: paths whose last event above `after` is a PUT, with its cursor. */
  liveOf(user: string, prefixes: readonly string[], after: Cursor = CURSOR_ZERO): Map<string, Cursor> {
    const live = new Map<string, Cursor>();
    for (const [path, event] of this.lastEvents(user, prefixes, after)) {
      if (event.type === 'PUT') live.set(path, event.cursor);
    }
    return new Map([...live].sort(([a], [b]) => comparePaths(a, b)));
  }

  async resolveHomeserver(user: string): Promise<string | null> {
    return this.homeserverOf.get(user) ?? null;
  }

  async readEvents(request: ReadEventsRequest): Promise<AuthoredStreamEvent[]> {
    const server = this.reachable(request.homeserver);
    if (request.users.length === 0 || request.users.length > MAX_USERS_PER_REQUEST) {
      throw new InvalidIndexInputError(`a request takes 1 to ${MAX_USERS_PER_REQUEST} users`);
    }
    if (request.limit < 1 || request.limit > MAX_LIMIT) {
      throw new InvalidIndexInputError(`limit must be 1 to ${MAX_LIMIT}`);
    }
    const cursors = new Map(request.users.map(({ user, cursor }): [string, Cursor | null] => [user, cursor]));
    const matches = server.log.filter((event) => {
      if (!cursors.has(event.author)) return false;
      if (!request.paths.some((prefix) => event.path.startsWith(prefix))) return false;
      const cursor = cursors.get(event.author) ?? null;
      if (cursor === null) return true;
      return request.reverse ? event.cursor < cursor : event.cursor > cursor;
    });
    if (request.reverse) matches.reverse();
    const events = matches.slice(0, request.limit).map(copyEvent);
    this.reads.push({
      homeserver: request.homeserver,
      users: request.users.map(({ user }) => user),
      reverse: request.reverse,
      events: events.map(copyEvent),
    });
    return events;
  }

  async getPublic({ author, path }: GetPublicRequest): Promise<Uint8Array | null> {
    const server = this.reachable(this.homeserverOfUser(author));
    const bytes = server.files.get(fileKey(author, path));
    return bytes === undefined ? null : bytes.slice();
  }

  private append(server: FakeHomeserver, event: Omit<AuthoredStreamEvent, 'cursor'>): Cursor {
    const cursor = BigInt(server.next);
    server.next += 1;
    const stored: AuthoredStreamEvent = { type: event.type, path: event.path, author: event.author, cursor };
    if (event.hash !== undefined) stored.hash = event.hash;
    server.log.push(stored);
    return cursor;
  }

  private reachable(homeserver: string): FakeHomeserver {
    const server = this.server(homeserver);
    if (server.down) throw new HomeserverUnreachableError(homeserver);
    if (server.rateLimits > 0) {
      server.rateLimits -= 1;
      throw new RateLimitedError(homeserver, server.retryAfterMs);
    }
    return server;
  }

  private server(homeserver: string): FakeHomeserver {
    const server = this.homeservers.get(homeserver);
    if (server === undefined) throw new InvalidIndexInputError(`unknown homeserver ${homeserver}`);
    return server;
  }

  private homeserverOfUser(user: string): string {
    const homeserver = this.homeserverOf.get(user);
    if (homeserver === undefined) throw new InvalidIndexInputError(`unknown user ${user}`);
    return homeserver;
  }
}
