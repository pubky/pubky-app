import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { NexusResponse } from '@/libs/indexer/social/nexusRouter';
import { InvalidQueryError, UnavailableQueryError } from '@/libs/indexer/social/queries/queries.errors';
import type { MoreHint } from '@/libs/indexer/social/queries/queries.types';
import type { History, SocialView } from '@/libs/indexer/social/social.view';
import type { BackfillOutcome, SocialIndexer } from '@/libs/indexer/social/socialIndexer';
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

/** A post stream page of these keys. */
const page = (keys: string[], more?: MoreHint[]): NexusResponse =>
  answer({ post_keys: keys, last_post_score: keys.length > 0 ? 1 : null }, more);
const olderOf = (author: string): MoreHint => ({ kind: 'backfill', author });
const keysOf = (from: number, count: number) => Array.from({ length: count }, (_, i) => `alice:${from + i}`);

/** A step that read a page of older history short of the start. */
const STEP: BackfillOutcome = { status: 'ran', complete: false, events: 100, posts: 1, sinceMs: 50 };
const COMPLETE: BackfillOutcome = { ...STEP, complete: true, sinceMs: null };

/** A view whose authors' loaded history starts at these times, unknown for anyone else. */
const viewSince = (since: Record<string, number> = {}) =>
  asOpaque<SocialView>({
    historyOf: (author: string): History => ({ complete: false, sinceMs: since[author] ?? null, held: false }),
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
    ensureFile: vi.fn<SocialIndexer['ensureFile']>().mockResolvedValue(undefined),
    backfill: vi.fn<SocialIndexer['backfill']>().mockResolvedValue(STEP),
    view: vi.fn<SocialIndexer['view']>().mockReturnValue(viewSince()),
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

    it('answers the /v0 file details from the index, loading the file records it lacks first', async () => {
      const path = '/pub/pubky.app/files/0033';
      const indexer = fakeIndexer(answer([], [{ kind: 'file', author: 'olga', path }]), answer([{ id: '0033' }]));
      const url = buildNexusUrl('files/by_ids', { version: 'v0' });
      const body = JSON.stringify({ uris: [`pubky://olga${path}`] });

      await expect(queryNexus({ url, method: HttpMethod.POST, body })).resolves.toEqual([{ id: '0033' }]);

      expect(indexer.ensureFile).toHaveBeenCalledExactlyOnceWith('olga', path);
      expect(indexer.request).toHaveBeenCalledTimes(2);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('loads the posts a by_ids read lacks, once, and asks once more', async () => {
      const indexer = fakeIndexer(
        answer([], [{ kind: 'post', author: 'olga', postId: '0033' }]),
        answer([{ id: 'olga:0033' }]),
      );
      const body = JSON.stringify({ post_ids: ['olga:0033'] });

      await expect(
        queryNexus({ url: uniqueUrl('stream/posts/by_ids'), method: HttpMethod.POST, body }),
      ).resolves.toEqual([{ id: 'olga:0033' }]);

      expect(indexer.ensurePost).toHaveBeenCalledExactlyOnceWith('olga', '0033');
      expect(indexer.request).toHaveBeenCalledTimes(2);
    });

    // A card reads its post through by_ids: a settled answer without the post is its not-found state
    it('keeps a by_ids read unsettled until the post it lacks is loaded', async () => {
      const indexer = fakeIndexer(
        answer([], [{ kind: 'post', author: 'olga', postId: '0034' }]),
        answer([{ id: 'olga:0034' }]),
      );
      const load = Promise.withResolvers<void>();
      indexer.ensurePost.mockReturnValueOnce(load.promise);
      const body = JSON.stringify({ post_ids: ['olga:0034'] });
      let settled = false;

      const read = queryNexus({ url: uniqueUrl('stream/posts/by_ids'), method: HttpMethod.POST, body }).finally(() => {
        settled = true;
      });
      await vi.waitFor(() => expect(indexer.ensurePost).toHaveBeenCalledOnce());
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(settled).toBe(false);

      load.resolve();
      await expect(read).resolves.toEqual([{ id: 'olga:0034' }]);
    });

    it('answers a by_ids read at once without a post the index proves absent', async () => {
      const indexer = fakeIndexer(answer([]));
      const body = JSON.stringify({ post_ids: ['olga:0035'] });

      await expect(
        queryNexus({ url: uniqueUrl('stream/posts/by_ids'), method: HttpMethod.POST, body }),
      ).resolves.toEqual([]);

      expect(indexer.ensurePost).not.toHaveBeenCalled();
      expect(indexer.request).toHaveBeenCalledOnce();
    });

    it('loads the author of a stream the index has not loaded, and asks once more', async () => {
      const indexer = fakeIndexer(
        answer({ post_keys: [] }, [{ kind: 'user', user: 'olga' }]),
        answer({ post_keys: ['olga:1'] }),
      );

      await expect(queryNexus({ url: uniqueUrl('stream/posts/keys?source=author&author_id=olga') })).resolves.toEqual({
        post_keys: ['olga:1'],
      });

      expect(indexer.ensureUser).toHaveBeenCalledExactlyOnceWith('olga');
    });

    describe('a post stream page', () => {
      const AUTHOR_PAGE = 'stream/posts/keys?source=author&author_id=alice&limit=3&start=100';

      it('loads older history into a short page, round after round, until it is full', async () => {
        const indexer = fakeIndexer(
          page(keysOf(0, 1), [olderOf('alice')]),
          page(keysOf(0, 2), [olderOf('alice')]),
          page(keysOf(0, 3), [olderOf('alice')]),
        );

        await expect(queryNexus({ url: uniqueUrl(AUTHOR_PAGE) })).resolves.toMatchObject({ post_keys: keysOf(0, 3) });

        expect(indexer.backfill).toHaveBeenCalledTimes(2);
        expect(indexer.backfill).toHaveBeenLastCalledWith('alice', 'activity', 1, { force: true });
        expect(indexer.request).toHaveBeenCalledTimes(3);
      });

      it('serves a full page as it came, whatever history it names', async () => {
        const indexer = fakeIndexer(page(keysOf(0, 3), [olderOf('alice')]));

        await expect(queryNexus({ url: uniqueUrl(AUTHOR_PAGE) })).resolves.toMatchObject({ post_keys: keysOf(0, 3) });

        expect(indexer.backfill).not.toHaveBeenCalled();
        expect(indexer.request).toHaveBeenCalledOnce();
      });

      it('ends at a short page once a step reaches the start of the history', async () => {
        const indexer = fakeIndexer(page(keysOf(0, 1), [olderOf('alice')]), page(keysOf(0, 2), [olderOf('alice')]));
        indexer.backfill.mockResolvedValueOnce(COMPLETE);

        await expect(queryNexus({ url: uniqueUrl(AUTHOR_PAGE) })).resolves.toMatchObject({ post_keys: keysOf(0, 2) });

        expect(indexer.backfill).toHaveBeenCalledOnce();
        expect(indexer.request).toHaveBeenCalledTimes(2);
      });

      it('ends at a short page the index names no older history for', async () => {
        const indexer = fakeIndexer(page(keysOf(0, 1), [olderOf('alice')]), page(keysOf(0, 2)));

        await expect(queryNexus({ url: uniqueUrl(AUTHOR_PAGE) })).resolves.toMatchObject({ post_keys: keysOf(0, 2) });

        expect(indexer.backfill).toHaveBeenCalledOnce();
        expect(indexer.request).toHaveBeenCalledTimes(2);
      });

      it('keeps stepping through rounds that add no post while the history moves back', async () => {
        const short = page(keysOf(0, 1), [olderOf('alice')]);
        const indexer = fakeIndexer(short, short, short, short, page(keysOf(0, 3), [olderOf('alice')]));

        await expect(queryNexus({ url: uniqueUrl(AUTHOR_PAGE) })).resolves.toMatchObject({ post_keys: keysOf(0, 3) });

        expect(indexer.backfill).toHaveBeenCalledTimes(4);
        expect(indexer.request).toHaveBeenCalledTimes(5);
      });

      it('ends without asking again when every step of a round fails or is skipped', async () => {
        const indexer = fakeIndexer(page(keysOf(0, 1), [olderOf('alice'), olderOf('bob')]));
        indexer.backfill.mockRejectedValueOnce(new Error('homeserver down'));
        indexer.backfill.mockResolvedValueOnce({ ...STEP, status: 'skipped', events: 0, posts: 0 });

        await expect(queryNexus({ url: uniqueUrl(AUTHOR_PAGE) })).resolves.toMatchObject({ post_keys: keysOf(0, 1) });

        expect(indexer.backfill).toHaveBeenCalledTimes(2);
        expect(indexer.request).toHaveBeenCalledOnce();
      });

      it('steps no further for an author whose step failed, and goes on with the others', async () => {
        const both = [olderOf('ann'), olderOf('ben')];
        const indexer = fakeIndexer(page([], both), page(['ben:1'], both), page(['ben:1', 'ben:2', 'ben:3'], both));
        indexer.backfill.mockImplementation(async (author) => {
          if (author === 'ann') throw new Error('homeserver down');
          return STEP;
        });

        await queryNexus({ url: uniqueUrl('stream/posts/keys?source=following&observer_id=me&limit=3&start=900') });

        expect(indexer.backfill.mock.calls.map(([author]) => author)).toEqual(['ann', 'ben', 'ben']);
        expect(indexer.request).toHaveBeenCalledTimes(3);
      });

      it('stops after 20 rounds, a safety net for steps that never end the extension', async () => {
        const short = page(keysOf(0, 1), [olderOf('alice')]);
        const indexer = fakeIndexer(...Array.from({ length: 21 }, () => short), page(keysOf(0, 3)));

        await expect(queryNexus({ url: uniqueUrl(AUTHOR_PAGE) })).resolves.toMatchObject({ post_keys: keysOf(0, 1) });

        expect(indexer.backfill).toHaveBeenCalledTimes(20);
        expect(indexer.request).toHaveBeenCalledTimes(21);
      });

      it('never extends a head poll, even when its answer names older history', async () => {
        const indexer = fakeIndexer(page([], [olderOf('alice')]));

        await queryNexus({ url: uniqueUrl('stream/posts/keys?source=author&author_id=alice&limit=3&end=100') });

        expect(indexer.backfill).not.toHaveBeenCalled();
        expect(indexer.request).toHaveBeenCalledOnce();
      });
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
