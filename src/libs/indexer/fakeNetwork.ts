import { CURSOR_ZERO } from './cursor';
import { HomeserverUnreachableError, InvalidIndexInputError, RateLimitedError } from './indexer.errors';
import type { Cursor, StreamEvent } from './indexer.types';
import { comparePaths } from './run';
import type { AuthoredStreamEvent, GetPublicRequest, IndexerTransport, ReadEventsRequest } from './transport.types';

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
const copyEvent = (event: AuthoredStreamEvent): AuthoredStreamEvent => ({ ...event });

export class FakeNetwork implements IndexerTransport {
  readonly reads: ReadLogEntry[] = [];
  private readonly homeservers = new Map<string, FakeHomeserver>();
  private readonly homeserverOf = new Map<string, string>();
  private readonly indexFiles = new Map<string, Uint8Array>();

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

  /** The last event of each of the user's paths under `prefixes` with a cursor above `after`. */
  lastEvents(user: string, prefixes: readonly string[], after: Cursor = CURSOR_ZERO): Map<string, StreamEvent> {
    const last = new Map<string, StreamEvent>();
    for (const event of this.server(this.homeserverOfUser(user)).log) {
      if (event.author !== user || event.cursor <= after) continue;
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

  async listIndexFiles(): Promise<string[]> {
    return [...this.indexFiles.keys()];
  }

  async readIndexFile(name: string): Promise<Uint8Array | null> {
    return this.indexFiles.get(name)?.slice() ?? null;
  }

  async writeIndexFile(name: string, bytes: Uint8Array): Promise<void> {
    this.indexFiles.set(name, bytes.slice());
  }

  async deleteIndexFile(name: string): Promise<void> {
    this.indexFiles.delete(name);
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
