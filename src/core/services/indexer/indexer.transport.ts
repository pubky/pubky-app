import type { StorageLock } from '@synonymdev/pubky';
import {
  INDEXER_FILE_SEGMENT_PATTERN,
  INDEXER_FILES_PATH,
  INDEXER_READ_TIMEOUT_MS,
  INDEXER_RECORD_MAX_BYTES,
} from '@/config/indexer';
import { isAppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import { getRetryAfter, hasHttpStatus } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import {
  HomeserverUnreachableError,
  IndexerError,
  IndexFileLockedError,
  IndexFileLockLostError,
  InvalidIndexInputError,
  RateLimitedError,
} from '@/libs/indexer/indexer.errors';
import type { IndexerTransport, IndexFileLock, IndexFiles } from '@/libs/indexer/transport.types';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';

/**
 * The library throws only its own errors across the transport: a 429 becomes `RateLimitedError` with the
 * homeserver's `retry-after`, anything else `HomeserverUnreachableError`, which the crawl retries, then backs off on.
 */
function toIndexerError(homeserver: string, error: unknown): IndexerError {
  if (hasHttpStatus(error, HttpStatusCode.TOO_MANY_REQUESTS)) {
    const retryAfterSeconds = getRetryAfter(error);
    return new RateLimitedError(homeserver, retryAfterSeconds === undefined ? undefined : retryAfterSeconds * 1000, {
      cause: error,
    });
  }
  return new HomeserverUnreachableError(homeserver, { cause: error });
}

/** A path of the index's own folder: segments a path carries unescaped, none of them a dot segment. */
function isIndexFilePath(path: string, prefix: boolean): boolean {
  const segments = path.split('/');
  // A prefix names a folder: empty, or ending in `/`.
  if (prefix && segments.pop() !== '') return false;
  return segments.every((segment) => INDEXER_FILE_SEGMENT_PATTERN.test(segment) && segment !== '.' && segment !== '..');
}

function indexFileUrl(owner: Pubky, path: string, prefix = false): string {
  if (!isIndexFilePath(path, prefix)) throw new InvalidIndexInputError(`invalid index file path: ${path}`);
  return `pubky://${owner}${INDEXER_FILES_PATH}${path}`;
}

/**
 * The homeserver's lock on one index file. `storage` is `null` on a homeserver without locks, where the library's
 * read, merge, write runs unlocked: two folds at once can then lose one, never write anything untrue.
 */
class AccountIndexLock implements IndexFileLock {
  constructor(
    readonly path: string,
    readonly url: string,
    readonly storage: StorageLock | null,
  ) {}
}

/** The account lock behind a lock the library hands back: it only ever holds the ones this transport made. */
function accountLock(lock: IndexFileLock): AccountIndexLock {
  if (!(lock instanceof AccountIndexLock)) throw new InvalidIndexInputError(`not a lock of this account: ${lock.path}`);
  return lock;
}

/**
 * The index's own files in `owner`'s private tree, written with the session. A failure crosses as the library's error,
 * so the crawler's request path retries and paces these calls as it does its own.
 */
function accountIndexFiles(owner: Pubky): IndexFiles {
  const files = sessionIndexFiles(owner);
  const crossing = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      throw error instanceof IndexerError ? error : toIndexerError(owner, error);
    }
  };
  return {
    list: (prefix) => crossing(() => files.list(prefix)),
    read: (path) => crossing(() => files.read(path)),
    write: (path, bytes, lock) => crossing(() => files.write(path, bytes, lock)),
    delete: (path, lock) => crossing(() => files.delete(path, lock)),
    lock: (path, seconds) => crossing(() => files.lock(path, seconds)),
    refresh: (lock, seconds) => crossing(() => files.refresh(lock, seconds)),
    unlock: (lock) => crossing(() => files.unlock(lock)),
  };
}

function sessionIndexFiles(owner: Pubky): IndexFiles {
  const root = `pubky://${owner}${INDEXER_FILES_PATH}`;
  return {
    async list(prefix) {
      const urls = await HomeserverService.listAll({ baseDirectory: indexFileUrl(owner, prefix, true) });
      // Every file at any depth; a folder entry ends in `/` and names no file.
      return urls
        .filter((url) => url.startsWith(root) && !url.endsWith('/'))
        .map((url) => url.slice(root.length))
        .filter((path) => isIndexFilePath(path, false));
    },
    async read(path) {
      const file = await HomeserverService.getBytesIfExists(indexFileUrl(owner, path));
      return file?.bytes ?? null;
    },
    async write(path, bytes, lock) {
      const url = indexFileUrl(owner, path);
      const held = lock === undefined ? null : accountLock(lock).storage;
      if (held === null) await HomeserverService.putBlob({ url, blob: bytes });
      else if (!(await HomeserverService.putBytesLocked(url, held, bytes))) throw new IndexFileLockLostError(path);
    },
    async delete(path, lock) {
      const url = indexFileUrl(owner, path);
      const held = lock === undefined ? null : accountLock(lock).storage;
      if (held === null) await HomeserverService.deleteIdempotent(url);
      else if (!(await HomeserverService.deleteLocked(url, held))) throw new IndexFileLockLostError(path);
    },
    async lock(path, seconds) {
      const url = indexFileUrl(owner, path);
      const granted = await HomeserverService.lockOwned(url, seconds);
      if (granted === 'locked') throw new IndexFileLockedError(path);
      return new AccountIndexLock(path, url, granted === 'unsupported' ? null : granted);
    },
    async refresh(lock, seconds) {
      const { path, url, storage } = accountLock(lock);
      if (storage !== null && !(await HomeserverService.refreshLock(url, storage, seconds))) {
        throw new IndexFileLockLostError(path);
      }
    },
    async unlock(lock) {
      const { url, storage } = accountLock(lock);
      if (storage !== null) await HomeserverService.unlockOwned(url, storage);
    },
  };
}

const noStorage = (): never => {
  throw new InvalidIndexInputError('a visitor has no storage for index files');
};

/** A visitor has no storage: nothing to list or read, and the indexer saves no index for one. */
const VISITOR_INDEX_FILES: IndexFiles = {
  list: async () => [],
  read: async () => null,
  write: async () => noStorage(),
  delete: async () => noStorage(),
  lock: async () => noStorage(),
  refresh: async () => noStorage(),
  unlock: async () => noStorage(),
};

/**
 * The local index's way out: anonymous public reads of any homeserver, and the index's own files in `owner`'s
 * private tree, none for a visitor (`null`). Every request goes through `HomeserverService`.
 */
export function createIndexerTransport(owner: Pubky | null): IndexerTransport {
  return {
    indexFiles: owner === null ? VISITOR_INDEX_FILES : accountIndexFiles(owner),
    async resolveHomeserver(user) {
      try {
        return await HomeserverService.resolveIndexedUserHomeserver(user);
      } catch (error) {
        // A malformed key in someone's follow list can never resolve.
        if (isAppError(error) && error.category === ErrorCategory.Validation) return null;
        throw toIndexerError(user, error);
      }
    },
    async readEvents({ homeserver, users, paths, limit, reverse, signal }) {
      try {
        const events = await HomeserverService.readPublicEventPage({
          homeserverZ32: homeserver,
          users: users.map(({ user, cursor }) => ({ userZ32: user, cursor: cursor === null ? null : String(cursor) })),
          paths,
          limit,
          reverse,
          signal,
        });
        return events.map(({ owner: author, eventType, path, cursor, contentHash }) => ({
          type: eventType,
          author,
          path,
          cursor: BigInt(cursor),
          ...(contentHash === undefined ? {} : { hash: contentHash }),
        }));
      } catch (error) {
        throw toIndexerError(homeserver, error);
      }
    },
    async getPublic({ author, path, signal }) {
      try {
        return await HomeserverService.getPublicFileBytes({
          url: `pubky://${author}${path}`,
          maxBytes: INDEXER_RECORD_MAX_BYTES,
          timeoutMs: INDEXER_READ_TIMEOUT_MS,
          signal,
        });
      } catch (error) {
        // Too large for a record: read as a missing file, so the homeserver is not backed off.
        if (isAppError(error) && error.code === ClientErrorCode.PAYLOAD_TOO_LARGE) return null;
        // The transport is not told the author's homeserver; the author names the failing one well enough.
        throw toIndexerError(author, error);
      }
    },
  };
}
