import {
  INDEXER_FILE_NAME_PATTERN,
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
  type IndexerError,
  InvalidIndexInputError,
  RateLimitedError,
} from '@/libs/indexer/indexer.errors';
import type { IndexerTransport } from '@/libs/indexer/transport.types';
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

function indexFileUrl(owner: Pubky, name: string): string {
  if (!INDEXER_FILE_NAME_PATTERN.test(name)) throw new InvalidIndexInputError(`invalid index file name: ${name}`);
  return `pubky://${owner}${INDEXER_FILES_PATH}${name}`;
}

type IndexFiles = Pick<IndexerTransport, 'listIndexFiles' | 'readIndexFile' | 'writeIndexFile' | 'deleteIndexFile'>;

/** The index's own files in `owner`'s private tree, written with the session. */
function accountIndexFiles(owner: Pubky): IndexFiles {
  return {
    async listIndexFiles() {
      const urls = await HomeserverService.listAll({ baseDirectory: `pubky://${owner}${INDEXER_FILES_PATH}` });
      // A subdirectory ends in `/` and names nothing here.
      const names = urls.map((url) => url.slice(url.lastIndexOf('/') + 1));
      return names.filter((name) => INDEXER_FILE_NAME_PATTERN.test(name));
    },
    async readIndexFile(name) {
      const file = await HomeserverService.getBytesIfExists(indexFileUrl(owner, name));
      return file?.bytes ?? null;
    },
    async writeIndexFile(name, bytes) {
      await HomeserverService.putBlob({ url: indexFileUrl(owner, name), blob: bytes });
    },
    async deleteIndexFile(name) {
      await HomeserverService.deleteIdempotent(indexFileUrl(owner, name));
    },
  };
}

const noStorage = (): never => {
  throw new InvalidIndexInputError('a visitor has no storage for index files');
};

/** A visitor has no storage: nothing to list or read, and the indexer saves no index for one. */
const VISITOR_INDEX_FILES: IndexFiles = {
  listIndexFiles: async () => [],
  readIndexFile: async () => null,
  writeIndexFile: async () => noStorage(),
  deleteIndexFile: async () => noStorage(),
};

/**
 * The local index's way out: anonymous public reads of any homeserver, and the index's own files in `owner`'s
 * private tree, none for a visitor (`null`). Every request goes through `HomeserverService`.
 */
export function createIndexerTransport(owner: Pubky | null): IndexerTransport {
  return {
    ...(owner === null ? VISITOR_INDEX_FILES : accountIndexFiles(owner)),
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
