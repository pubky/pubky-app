import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { NexusResponse } from '@/libs/indexer/social/nexusRouter';
import { InvalidQueryError, UnavailableQueryError } from '@/libs/indexer/social/queries/queries.errors';
import type { MoreHint } from '@/libs/indexer/social/queries/queries.types';
import type { SocialIndexer } from '@/libs/indexer/social/socialIndexer';
import { NEXUS_LOCAL_INDEX_OPERATION } from '@/libs/observability/sentry.constants';
import { shouldDropAppErrorFromSentry } from '@/libs/observability/sentry.utils';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { IndexerService } from '@/services/indexer/indexer';
import { nexusRetryPolicy } from '@/services/nexus/nexus.query-client';
import { asOpaque } from '@/test-utils/type-assertions';
import { buildNexusUrl, fetchNexusNoContent, getNexusResponseStartedAt, queryNexus } from './nexus.utils';

const SOURCES_ENV = 'PUBKY_RUNTIME_INDEXER_SOURCES';

const answer = (json: unknown, more?: MoreHint[]): NexusResponse =>
  more ? { status: 200, json, coverage: { kind: 'scope' }, more } : { status: 200, json, coverage: { kind: 'scope' } };
const notFound = (known: boolean, more?: MoreHint[]): NexusResponse => ({
  status: 404,
  json: { error: 'missing' },
  coverage: known ? { kind: 'exact' } : { kind: 'scope', note: 'not loaded yet' },
  ...(more ? { more } : {}),
});

function fakeIndexer(...responses: Array<NexusResponse | Error>) {
  const request = vi.fn<SocialIndexer['request']>();
  for (const response of responses) {
    if (response instanceof Error) request.mockRejectedValueOnce(response);
    else request.mockResolvedValueOnce(response);
  }
  const indexer = {
    request,
    ensureUser: vi.fn<SocialIndexer['ensureUser']>().mockResolvedValue(undefined),
    ensurePost: vi.fn<SocialIndexer['ensurePost']>().mockResolvedValue(undefined),
    backfill: vi.fn<SocialIndexer['backfill']>().mockResolvedValue(undefined),
  };
  vi.spyOn(IndexerService, 'current').mockReturnValue(asOpaque<SocialIndexer>(indexer));
  return indexer;
}

let routeCount = 0;
/** A distinct URL per test, so the Nexus transport cache never answers for an earlier test. */
const uniqueUrl = (route: string) => buildNexusUrl(`${route}${route.includes('?') ? '&' : '?'}n=${(routeCount += 1)}`);

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('queryNexus routing by indexer sources', () => {
  let fetch: MockInstance<typeof globalThis.fetch>;

  const useSources = (sources: string) => {
    process.env[SOURCES_ENV] = sources;
    resetRuntimeConfigForTests();
  };

  beforeEach(() => {
    fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ from: 'nexus' })));
  });

  afterEach(() => {
    delete process.env[SOURCES_ENV];
    resetRuntimeConfigForTests();
    vi.restoreAllMocks();
  });

  describe('nexus', () => {
    it('asks Nexus and never the local index', async () => {
      useSources('nexus');
      const current = vi.spyOn(IndexerService, 'current');

      await expect(queryNexus({ url: uniqueUrl('user/alice/details') })).resolves.toEqual({ from: 'nexus' });

      expect(fetch).toHaveBeenCalledOnce();
      expect(current).not.toHaveBeenCalled();
    });
  });

  describe('local', () => {
    beforeEach(() => useSources('local'));

    it('returns the index’s answer with no request to Nexus and no freshness stamp', async () => {
      const indexer = fakeIndexer(answer({ post_keys: ['alice:0033'], last_post_score: 1 }));
      const body = JSON.stringify({ post_ids: ['alice:0033'] });
      const url = uniqueUrl('stream/posts/by_ids');

      const data = await queryNexus<object>({ url, method: HttpMethod.POST, body });

      expect(data).toEqual({ post_keys: ['alice:0033'], last_post_score: 1 });
      expect(getNexusResponseStartedAt(data)).toBeUndefined();
      expect(indexer.request).toHaveBeenCalledExactlyOnceWith({ url, method: 'POST', body });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('raises the Nexus 404 for a post the index proves absent, at once and kept out of Sentry', async () => {
      const indexer = fakeIndexer(notFound(true));
      const url = uniqueUrl('post/alice/0033');

      const error = await rejection(queryNexus({ url }));

      expect(error).toMatchObject({
        service: ErrorService.Nexus,
        operation: NEXUS_LOCAL_INDEX_OPERATION,
        code: ClientErrorCode.NOT_FOUND,
        context: { endpoint: url, statusCode: 404 },
      });
      expect(shouldDropAppErrorFromSentry(asOpaque<AppError>(error))).toBe(true);
      expect(indexer.request).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('raises a non-retryable 422, kept out of Sentry, for a read the index cannot serve', async () => {
      fakeIndexer(new UnavailableQueryError('search/posts/by_content', 'needs a global index'));

      const error = await rejection(queryNexus({ url: uniqueUrl('search/posts/by_content?query=x') }));

      expect(error).toMatchObject({ code: ClientErrorCode.UNPROCESSABLE, context: { statusCode: 422 } });
      expect(nexusRetryPolicy(5).shouldRetry(0, error)).toBe(false);
      expect(shouldDropAppErrorFromSentry(asOpaque<AppError>(error))).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('raises the same 422 while no index runs, signed out', async () => {
      vi.spyOn(IndexerService, 'current').mockReturnValue(null);

      await expect(queryNexus({ url: uniqueUrl('user/alice/details') })).rejects.toMatchObject({
        code: ClientErrorCode.UNPROCESSABLE,
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('keeps a malformed read reportable', async () => {
      fakeIndexer(new InvalidQueryError('stream/posts/keys', 'limit', 'must be a non-negative integer'));

      const error = await rejection(queryNexus({ url: uniqueUrl('stream/posts/keys?limit=-1') }));

      expect(error).toMatchObject({ code: ClientErrorCode.BAD_REQUEST, context: { statusCode: 400 } });
      expect(shouldDropAppErrorFromSentry(asOpaque<AppError>(error))).toBe(false);
    });

    it('loads what an unproven 404 names, once, and asks once more', async () => {
      const indexer = fakeIndexer(
        notFound(false, [{ kind: 'post', author: 'alice', postId: '0033' }]),
        answer({ ok: 1 }),
      );

      await expect(queryNexus({ url: uniqueUrl('post/alice/0033') })).resolves.toEqual({ ok: 1 });

      expect(indexer.ensurePost).toHaveBeenCalledExactlyOnceWith('alice', '0033');
      expect(indexer.request).toHaveBeenCalledTimes(2);
    });

    it('stops after the one retry and raises the 404 when the second answer still cannot vouch for it', async () => {
      const hint: MoreHint = { kind: 'user', user: 'bob' };
      const indexer = fakeIndexer(notFound(false, [hint]), notFound(false, [hint]));

      await expect(queryNexus({ url: uniqueUrl('user/bob/details') })).rejects.toMatchObject({
        code: ClientErrorCode.NOT_FOUND,
      });

      expect(indexer.ensureUser).toHaveBeenCalledExactlyOnceWith('bob');
      expect(indexer.request).toHaveBeenCalledTimes(2);
    });

    it('still asks again when loading a hint fails', async () => {
      const indexer = fakeIndexer(notFound(false, [{ kind: 'user', user: 'bob' }]), answer({ ok: 2 }));
      indexer.ensureUser.mockRejectedValueOnce(new Error('homeserver down'));

      await expect(queryNexus({ url: uniqueUrl('user/bob/details') })).resolves.toEqual({ ok: 2 });
    });

    it('extends an answer about one user with the history it names', async () => {
      const indexer = fakeIndexer(answer({ posts: 1 }, [{ kind: 'backfill', author: 'alice' }]), answer({ posts: 9 }));

      await expect(queryNexus({ url: uniqueUrl('user/alice/counts') })).resolves.toEqual({ posts: 9 });

      expect(indexer.backfill).toHaveBeenCalledExactlyOnceWith('alice', 'activity', 1);
    });

    it('returns a stream page as it is, leaving older history to pagination', async () => {
      const indexer = fakeIndexer(answer({ post_keys: [] }, [{ kind: 'backfill', author: 'alice' }]));

      await expect(queryNexus({ url: uniqueUrl('stream/posts/keys?source=all') })).resolves.toEqual({ post_keys: [] });

      expect(indexer.backfill).not.toHaveBeenCalled();
      expect(indexer.request).toHaveBeenCalledOnce();
    });

    it('sends no ingest anywhere', async () => {
      await fetchNexusNoContent({ url: uniqueUrl('ingest/alice'), method: HttpMethod.PUT });

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('local,nexus', () => {
    beforeEach(() => useSources('local,nexus'));

    it('returns the index’s answer without asking Nexus', async () => {
      fakeIndexer(answer({ from: 'index' }));

      await expect(queryNexus({ url: uniqueUrl('user/alice/details') })).resolves.toEqual({ from: 'index' });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('asks Nexus for a read the index cannot serve', async () => {
      fakeIndexer(new UnavailableQueryError('tags/hot', 'needs the global ranking'));

      await expect(queryNexus({ url: uniqueUrl('tags/hot?reach=all') })).resolves.toEqual({ from: 'nexus' });
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('asks Nexus for a 404 the index cannot vouch for, after its one retry', async () => {
      const hint: MoreHint = { kind: 'user', user: 'carol' };
      fakeIndexer(notFound(false, [hint]), notFound(false, [hint]));

      await expect(queryNexus({ url: uniqueUrl('user/carol/details') })).resolves.toEqual({ from: 'nexus' });
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('raises a proven 404 without asking Nexus', async () => {
      fakeIndexer(notFound(true));

      await expect(queryNexus({ url: uniqueUrl('post/alice/0034') })).rejects.toMatchObject({
        code: ClientErrorCode.NOT_FOUND,
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('still sends the ingest to Nexus', async () => {
      await fetchNexusNoContent({ url: uniqueUrl('ingest/alice'), method: HttpMethod.PUT });

      expect(fetch).toHaveBeenCalledOnce();
    });
  });
});
