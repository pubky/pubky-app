import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, RateLimitErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { HomeserverUnreachableError, InvalidIndexInputError, RateLimitedError } from '@/libs/indexer/indexer.errors';
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
          { user: 'alice', cursor: 10n },
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
        { type: 'PUT', author: 'alice', path: '/pub/a', cursor: 18446744073709551615n, hash: 'aA==' },
        { type: 'DEL', author: 'bob', path: '/pub/b', cursor: 3n },
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
        signal: undefined,
      });
    });
  });

  describe('index files', () => {
    it('keeps them in the app’s private index directory', async () => {
      vi.mocked(HomeserverService.listAll).mockResolvedValue([`${FILES}a.bin`, `${FILES}nested/`, `${FILES}b.bin`]);
      vi.mocked(HomeserverService.getBytesIfExists).mockResolvedValue(null);

      await expect(transport.listIndexFiles()).resolves.toEqual(['a.bin', 'b.bin']);
      await expect(transport.readIndexFile('a.bin')).resolves.toBeNull();
      await transport.writeIndexFile('a.bin', new Uint8Array([2]));
      await transport.deleteIndexFile('a.bin');

      expect(HomeserverService.listAll).toHaveBeenCalledWith({ baseDirectory: FILES });
      expect(HomeserverService.getBytesIfExists).toHaveBeenCalledWith(`${FILES}a.bin`);
      expect(HomeserverService.putBlob).toHaveBeenCalledWith({ url: `${FILES}a.bin`, blob: new Uint8Array([2]) });
      expect(HomeserverService.deleteIdempotent).toHaveBeenCalledWith(`${FILES}a.bin`);
    });

    it('refuses a name that is not a plain path segment', async () => {
      await expect(transport.writeIndexFile('../settings.json', new Uint8Array())).rejects.toBeInstanceOf(
        InvalidIndexInputError,
      );
      expect(HomeserverService.putBlob).not.toHaveBeenCalled();
    });
  });
});
