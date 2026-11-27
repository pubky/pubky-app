import type { StorageLock } from '@synonymdev/pubky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INDEXER_READ_TIMEOUT_MS, INDEXER_RECORD_MAX_BYTES } from '@/config/indexer';
import { AuthErrorCode, ClientErrorCode, RateLimitErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import {
  HomeserverUnreachableError,
  IndexFileLockedError,
  IndexFileLockLostError,
  InvalidIndexInputError,
  RateLimitedError,
} from '@/libs/indexer/indexer.errors';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { createIndexerTransport } from './indexer.transport';

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    resolveIndexedUserHomeserver: vi.fn(),
    readPublicEventPage: vi.fn(),
    getPublicFileBytes: vi.fn(),
    listAll: vi.fn(),
    getBytesIfExists: vi.fn(),
    putBlob: vi.fn(),
    deleteIdempotent: vi.fn(),
    lockOwned: vi.fn(),
    putBytesLocked: vi.fn(),
    deleteLocked: vi.fn(),
    refreshLock: vi.fn(),
    unlockOwned: vi.fn(),
  },
}));

const OWNER = 'owner-pubky' as Pubky;
const FILES = `pubky://${OWNER}/priv/app.pubky/v1/index/`;
const params = { service: ErrorService.Homeserver, operation: 'test' };

describe('createIndexerTransport', () => {
  const transport = createIndexerTransport(OWNER);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('public reads', () => {
    it('resolves a homeserver, and a malformed key as never resolving', async () => {
      vi.mocked(HomeserverService.resolveIndexedUserHomeserver)
        .mockResolvedValueOnce('hs')
        .mockRejectedValueOnce(Err.validation(ValidationErrorCode.INVALID_INPUT, 'bad key', params));

      await expect(transport.resolveHomeserver('alice')).resolves.toBe('hs');
      await expect(transport.resolveHomeserver('not-a-key')).resolves.toBeNull();
    });

    it('reports a failed lookup as unreachable, so the crawl keeps what it resolved before', async () => {
      vi.mocked(HomeserverService.resolveIndexedUserHomeserver).mockRejectedValue(new Error('relay down'));

      await expect(transport.resolveHomeserver('alice')).rejects.toBeInstanceOf(HomeserverUnreachableError);
    });

    it('reads a page with string cursors and returns events with bigint cursors and their authors', async () => {
      vi.mocked(HomeserverService.readPublicEventPage).mockResolvedValue([
        { owner: 'alice', cursor: '18446744073709551615', eventType: 'PUT', path: '/pub/a', contentHash: 'aA==' },
        { owner: 'bob', cursor: '3', eventType: 'DEL', path: '/pub/b' },
      ]);
      const signal = new AbortController().signal;

      const events = await transport.readEvents({
        homeserver: 'hs',
        users: [
          { user: 'alice', cursor: BigInt(10) },
          { user: 'bob', cursor: null },
        ],
        paths: ['/pub/'],
        limit: 1000,
        reverse: false,
        signal,
      });

      expect(HomeserverService.readPublicEventPage).toHaveBeenCalledWith({
        homeserverZ32: 'hs',
        users: [
          { userZ32: 'alice', cursor: '10' },
          { userZ32: 'bob', cursor: null },
        ],
        paths: ['/pub/'],
        limit: 1000,
        reverse: false,
        signal,
      });
      expect(events).toEqual([
        { type: 'PUT', author: 'alice', path: '/pub/a', cursor: BigInt('18446744073709551615'), hash: 'aA==' },
        { type: 'DEL', author: 'bob', path: '/pub/b', cursor: BigInt(3) },
      ]);
    });

    it('maps a 429 to a rate limit carrying retry-after in milliseconds, and anything else to unreachable', async () => {
      const throttled = Err.rateLimit(RateLimitErrorCode.RATE_LIMITED, 'Too Many Requests', {
        ...params,
        context: { statusCode: HttpStatusCode.TOO_MANY_REQUESTS, retryAfter: 7 },
      });
      vi.mocked(HomeserverService.readPublicEventPage)
        .mockRejectedValueOnce(throttled)
        .mockRejectedValueOnce(Err.client(ClientErrorCode.BAD_REQUEST, 'nope', params));
      const request = { homeserver: 'hs', users: [], paths: [], limit: 1, reverse: false };

      const limited = await transport.readEvents(request).catch((caught: unknown) => caught);
      const failed = await transport.readEvents(request).catch((caught: unknown) => caught);

      expect(limited).toBeInstanceOf(RateLimitedError);
      expect(limited).toMatchObject({ homeserver: 'hs', retryAfterMs: 7000 });
      expect(failed).toBeInstanceOf(HomeserverUnreachableError);
    });

    it('fetches a public file by author and path, null when it is gone', async () => {
      vi.mocked(HomeserverService.getPublicFileBytes)
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockResolvedValueOnce(null);

      await expect(transport.getPublic({ author: 'alice', path: '/pub/social/v1/profile.json' })).resolves.toEqual(
        new Uint8Array([1]),
      );
      await expect(transport.getPublic({ author: 'alice', path: '/pub/x' })).resolves.toBeNull();
      expect(HomeserverService.getPublicFileBytes).toHaveBeenCalledWith({
        url: 'pubky://alice/pub/social/v1/profile.json',
        maxBytes: INDEXER_RECORD_MAX_BYTES,
        timeoutMs: INDEXER_READ_TIMEOUT_MS,
        signal: undefined,
      });
    });

    it('reads a file over the record cap as missing, without failing its homeserver', async () => {
      vi.mocked(HomeserverService.getPublicFileBytes).mockRejectedValueOnce(
        Err.client(ClientErrorCode.PAYLOAD_TOO_LARGE, 'too large', params),
      );

      await expect(transport.getPublic({ author: 'alice', path: '/pub/social/v1/posts/x' })).resolves.toBeNull();
      expect(INDEXER_RECORD_MAX_BYTES).toBe(1024 * 1024);
    });
  });

  describe('index files', () => {
    const HOT = '3/gbb13a/hot';

    it('keeps them in the app’s private index directory, listing every file under a prefix', async () => {
      vi.mocked(HomeserverService.listAll).mockResolvedValue([
        `${FILES}3/gbb13a/d/w1`,
        `${FILES}3/gbb13a/d/`,
        `${FILES}3/gbb13a/hot`,
        `${FILES}old.idx`,
      ]);
      vi.mocked(HomeserverService.getBytesIfExists).mockResolvedValue(null);

      await expect(transport.indexFiles.list('')).resolves.toEqual(['3/gbb13a/d/w1', HOT, 'old.idx']);
      await expect(transport.indexFiles.read(HOT)).resolves.toBeNull();
      await transport.indexFiles.write('old.idx', new Uint8Array([2]));
      await transport.indexFiles.delete('old.idx');

      expect(HomeserverService.listAll).toHaveBeenCalledWith({ baseDirectory: FILES });
      expect(HomeserverService.getBytesIfExists).toHaveBeenCalledWith(`${FILES}${HOT}`);
      expect(HomeserverService.putBlob).toHaveBeenCalledWith({ url: `${FILES}old.idx`, blob: new Uint8Array([2]) });
      expect(HomeserverService.deleteIdempotent).toHaveBeenCalledWith(`${FILES}old.idx`);
    });

    it('writes and deletes under the homeserver’s lock, and maps a held or lost lock to the library’s errors', async () => {
      const storageLock = {} as StorageLock;
      vi.mocked(HomeserverService.lockOwned).mockResolvedValueOnce(storageLock).mockResolvedValueOnce('locked');
      vi.mocked(HomeserverService.putBytesLocked).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      vi.mocked(HomeserverService.deleteLocked).mockResolvedValueOnce(false);
      vi.mocked(HomeserverService.refreshLock).mockResolvedValueOnce(false);

      const lock = await transport.indexFiles.lock(HOT, 30);
      await transport.indexFiles.write(HOT, new Uint8Array([1]), lock);
      await expect(transport.indexFiles.write(HOT, new Uint8Array([1]), lock)).rejects.toBeInstanceOf(
        IndexFileLockLostError,
      );
      await expect(transport.indexFiles.delete(HOT, lock)).rejects.toBeInstanceOf(IndexFileLockLostError);
      await expect(transport.indexFiles.refresh(lock, 30)).rejects.toBeInstanceOf(IndexFileLockLostError);
      await transport.indexFiles.unlock(lock);
      await expect(transport.indexFiles.lock(HOT, 30)).rejects.toBeInstanceOf(IndexFileLockedError);

      expect(HomeserverService.lockOwned).toHaveBeenCalledWith(`${FILES}${HOT}`, 30);
      expect(HomeserverService.putBytesLocked).toHaveBeenCalledWith(`${FILES}${HOT}`, storageLock, new Uint8Array([1]));
      expect(HomeserverService.unlockOwned).toHaveBeenCalledWith(`${FILES}${HOT}`, storageLock);
      expect(HomeserverService.putBlob).not.toHaveBeenCalled();
    });

    it('maps a failed call to the library’s errors, a 429 to a rate limit, so the crawl retries and paces it', async () => {
      const throttled = Err.rateLimit(RateLimitErrorCode.RATE_LIMITED, 'Too Many Requests', {
        ...params,
        context: { statusCode: HttpStatusCode.TOO_MANY_REQUESTS, retryAfter: 2 },
      });
      vi.mocked(HomeserverService.getBytesIfExists).mockRejectedValueOnce(throttled);
      vi.mocked(HomeserverService.putBlob).mockRejectedValueOnce(new Error('503'));

      const limited = await transport.indexFiles.read(HOT).catch((caught: unknown) => caught);
      const failed = await transport.indexFiles.write(HOT, new Uint8Array([1])).catch((caught: unknown) => caught);

      expect(limited).toBeInstanceOf(RateLimitedError);
      expect(limited).toMatchObject({ homeserver: OWNER, retryAfterMs: 2000 });
      expect(failed).toBeInstanceOf(HomeserverUnreachableError);
    });

    it('lets a refusal no retry changes through as it is, such as a session not restored yet', async () => {
      const refused = Err.auth(AuthErrorCode.UNAUTHORIZED, 'Reading owned storage requires a session.', params);
      vi.mocked(HomeserverService.getBytesIfExists).mockRejectedValueOnce(refused);

      await expect(transport.indexFiles.read(HOT)).rejects.toBe(refused);
    });

    it('writes unlocked under a lock of a homeserver without locks', async () => {
      vi.mocked(HomeserverService.lockOwned).mockResolvedValueOnce('unsupported');

      const lock = await transport.indexFiles.lock(HOT, 30);
      await transport.indexFiles.write(HOT, new Uint8Array([1]), lock);
      await transport.indexFiles.refresh(lock, 30);
      await transport.indexFiles.unlock(lock);

      expect(HomeserverService.putBlob).toHaveBeenCalledWith({ url: `${FILES}${HOT}`, blob: new Uint8Array([1]) });
      expect(HomeserverService.putBytesLocked).not.toHaveBeenCalled();
      expect(HomeserverService.refreshLock).not.toHaveBeenCalled();
      expect(HomeserverService.unlockOwned).not.toHaveBeenCalled();
    });

    it('refuses a path that leaves the folder or is no plain path', async () => {
      for (const path of ['../settings.json', '3/../../x', '3//hot', '3/hot/', 'a b']) {
        await expect(transport.indexFiles.write(path, new Uint8Array())).rejects.toBeInstanceOf(InvalidIndexInputError);
      }
      await expect(transport.indexFiles.list('3/hot')).rejects.toBeInstanceOf(InvalidIndexInputError);
      expect(HomeserverService.putBlob).not.toHaveBeenCalled();
      expect(HomeserverService.listAll).not.toHaveBeenCalled();
    });

    it('has none for a visitor, who has no storage', async () => {
      const visitor = createIndexerTransport(null);

      await expect(visitor.indexFiles.list('')).resolves.toEqual([]);
      await expect(visitor.indexFiles.read(HOT)).resolves.toBeNull();
      await expect(visitor.indexFiles.write(HOT, new Uint8Array([2]))).rejects.toBeInstanceOf(InvalidIndexInputError);
      await expect(visitor.indexFiles.delete(HOT)).rejects.toBeInstanceOf(InvalidIndexInputError);
      await expect(visitor.indexFiles.lock(HOT, 30)).rejects.toBeInstanceOf(InvalidIndexInputError);
      expect(HomeserverService.listAll).not.toHaveBeenCalled();
      expect(HomeserverService.putBlob).not.toHaveBeenCalled();
      expect(HomeserverService.lockOwned).not.toHaveBeenCalled();
    });
  });
});
