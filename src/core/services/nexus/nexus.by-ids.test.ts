import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNexusUrl } from '@/config/nexus';
import { HttpMethod } from '@/libs/http/http.types';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import { buildNexusQueryKey, getNexusResponseStartedAt } from '@/services/nexus/nexus.utils';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';

describe('nexus.by-ids', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;
  const nexusResponse = (body: unknown) => new Response(JSON.stringify(body));

  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch;
    nexusQueryClient.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it.each(['users', 'posts'] as const)(
    'recovers failed joined %s IDs without discarding its successful request',
    async (kind) => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const running = Promise.withResolvers<Response>();
      const ids = kind === 'users' ? ['alice', 'bob', 'carol'] : ['alice:one', 'bob:two', 'carol:three'];
      const records = ids.map((id) =>
        kind === 'users' ? { details: { id } } : { details: { author: id.split(':')[0], id: id.split(':')[1] } },
      );
      const fetchIds = (requested: string[]) =>
        kind === 'users'
          ? NexusUserStreamService.fetchByIds({ user_ids: requested })
          : NexusPostStreamService.fetchByIds({ post_ids: requested });
      mockFetch
        .mockReturnValueOnce(running.promise)
        .mockResolvedValueOnce(nexusResponse([records[2]]))
        .mockResolvedValueOnce(nexusResponse([records[1]]));
      const original = Promise.allSettled([fetchIds(ids.slice(0, 2))]);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      now.mockReturnValue(2_000);
      const overlap = Promise.allSettled([fetchIds(ids.slice(1))]);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
      now.mockReturnValue(3_000);
      running.resolve(new Response('Bad request', { status: 400 }));
      try {
        expect((await original)[0].status).toBe('rejected');
        const [result] = await overlap;
        expect(result.status).toBe('fulfilled');
        if (result.status !== 'fulfilled') return;
        expect(result.value).toEqual(records.slice(1));
        expect(getNexusResponseStartedAt(result.value)).toBe(2_000);
        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(
          mockFetch.mock.calls.map(
            ([, options]) => JSON.parse(options.body)[kind === 'users' ? 'user_ids' : 'post_ids'],
          ),
        ).toEqual([ids.slice(0, 2), ids.slice(2), [ids[1]]]);
      } finally {
        now.mockRestore();
      }
    },
  );

  it('rejects its own failed request without waiting for an unrelated joined batch', async () => {
    const running = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(running.promise).mockResolvedValueOnce(new Response('Bad request', { status: 400 }));
    const original = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
    const rejected = vi.fn();
    const overlap = NexusUserStreamService.fetchByIds({ user_ids: ['bob', 'carol'] }).catch(rejected);
    try {
      await vi.waitFor(() => expect(rejected).toHaveBeenCalledOnce());
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      running.resolve(nexusResponse([{ details: { id: 'bob' } }]));
      await Promise.all([original, overlap]);
    }
  });

  it('does not replay joined requests canceled by a query-cache clear', async () => {
    const running = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(running.promise);
    const original = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
    const joined = NexusUserStreamService.fetchByIds({ user_ids: ['bob'] });
    const results = Promise.allSettled([original, joined]);
    nexusQueryClient.clear();
    running.resolve(nexusResponse([{ details: { id: 'bob' } }]));

    expect((await results).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not start a fallback after a failed batch triggers a query-cache clear', async () => {
    const running = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(running.promise).mockResolvedValue(nexusResponse([]));
    const unsubscribe = nexusQueryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') {
        unsubscribe();
        nexusQueryClient.clear();
      }
    });
    const original = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
    const joined = NexusUserStreamService.fetchByIds({ user_ids: ['bob'] });
    const results = Promise.allSettled([original, joined]);
    running.resolve(new Response('Bad request', { status: 400 }));

    expect((await results).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('collapses two concurrent identical posts/by_ids calls into one request', async () => {
    const posts = [{ details: { author: 'author1', id: 'post1' } }];
    mockFetch.mockResolvedValueOnce(nexusResponse(posts));

    const [first, second] = await Promise.all([
      NexusPostStreamService.fetchByIds({ post_ids: ['author1:post2', 'author1:post1'] }),
      NexusPostStreamService.fetchByIds({ post_ids: ['author1:post1', 'author1:post2'] }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(posts);
    expect(second).toEqual(posts);
  });

  it('collapses two concurrent identical users/by_ids calls into one request', async () => {
    const users = [{ details: { id: 'user1' } }];
    mockFetch.mockResolvedValueOnce(nexusResponse(users));

    await Promise.all([
      NexusUserStreamService.fetchByIds({ user_ids: ['user2', 'user1'] }),
      NexusUserStreamService.fetchByIds({ user_ids: ['user1', 'user2'] }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each(['users', 'posts'] as const)(
    'shares in-flight %s across overlapping batches and individual cards',
    async (kind) => {
      const batch = Promise.withResolvers<Response>();
      const ids = kind === 'users' ? ['alice', 'bob', 'carol'] : ['alice:one', 'bob:two', 'carol:three'];
      const records =
        kind === 'users'
          ? ids.map((id) => ({ details: { id } }))
          : [
              { details: { author: 'alice', id: 'one' } },
              { details: { author: 'bob', id: 'two' } },
              { details: { author: 'carol', id: 'three' } },
            ];
      const fetchIds = (requested: string[]) =>
        kind === 'users'
          ? NexusUserStreamService.fetchByIds({ user_ids: requested })
          : NexusPostStreamService.fetchByIds({ post_ids: requested });
      mockFetch.mockReturnValueOnce(batch.promise).mockImplementation((_url, options) => {
        const requested = JSON.parse(options.body)[kind === 'users' ? 'user_ids' : 'post_ids'] as string[];
        return Promise.resolve(nexusResponse(records.filter((_record, index) => requested.includes(ids[index]))));
      });

      const full = fetchIds(ids.slice(0, 2));
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      const overlap = fetchIds(ids.slice(1));
      const card = fetchIds([ids[1]]);
      batch.resolve(nexusResponse(records.slice(0, 2)));

      const [fullResult, overlapResult, cardResult] = await Promise.all([full, overlap, card]);
      expect(fullResult).toEqual(records.slice(0, 2));
      expect(overlapResult).toEqual(records.slice(1));
      expect(cardResult).toEqual([records[1]]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const bodies = mockFetch.mock.calls.map(([, options]) => JSON.parse(options.body));
      expect(bodies.map((body) => body[kind === 'users' ? 'user_ids' : 'post_ids'])).toEqual([
        ids.slice(0, 2),
        ids.slice(2),
      ]);
    },
  );

  it('retains the oldest start time and sorted caller subset when combining pending users', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const running = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(running.promise).mockResolvedValueOnce(nexusResponse([{ details: { id: 'alice' } }]));
    try {
      const original = NexusUserStreamService.fetchByIds({ user_ids: ['bob', 'carol', 'missing'] });
      now.mockReturnValue(2_000);
      const overlap = NexusUserStreamService.fetchByIds({ user_ids: ['missing', 'bob', 'alice'] });
      const missing = NexusUserStreamService.fetchByIds({ user_ids: ['missing'] });
      running.resolve(nexusResponse([{ details: { id: 'bob' } }, { details: { id: 'carol' } }]));

      await original;
      const result = await overlap;
      expect(result).toEqual([{ details: { id: 'alice' } }, { details: { id: 'bob' } }]);
      expect(getNexusResponseStartedAt(result)).toBe(1_000);
      const absent = await missing;
      expect(absent).toEqual([]);
      expect(getNexusResponseStartedAt(absent)).toBe(1_000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('isolates overlapping user reads by viewer and depth', async () => {
    const running = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(running.promise).mockImplementation(() => Promise.resolve(nexusResponse([])));
    const first = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'], viewer_id: 'viewer-a', depth: 1 });
    const otherViewer = NexusUserStreamService.fetchByIds({ user_ids: ['bob'], viewer_id: 'viewer-b', depth: 1 });
    const otherDepth = NexusUserStreamService.fetchByIds({ user_ids: ['bob'], viewer_id: 'viewer-a', depth: 2 });
    const publicRead = NexusUserStreamService.fetchByIds({ user_ids: ['bob'], depth: 1 });
    running.resolve(nexusResponse([{ details: { id: 'bob' } }]));

    expect(await first).toEqual([{ details: { id: 'bob' } }]);
    expect(await Promise.all([otherViewer, otherDepth, publicRead])).toEqual([[], [], []]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('isolates overlapping posts by attachment metadata options', async () => {
    const running = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(running.promise).mockResolvedValueOnce(nexusResponse([]));
    const withMetadata = NexusPostStreamService.fetchByIds({ post_ids: ['alice:one', 'bob:two'] });
    const withoutMetadata = NexusPostStreamService.fetchByIds({
      post_ids: ['bob:two'],
      include_attachment_metadata: false,
    });
    running.resolve(nexusResponse([{ details: { author: 'bob', id: 'two' } }]));

    await withMetadata;
    expect(await withoutMetadata).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not use an older overlapping batch for a forced user refresh', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const running = Promise.withResolvers<Response>();
    mockFetch
      .mockReturnValueOnce(running.promise)
      .mockResolvedValueOnce(nexusResponse([{ details: { id: 'bob', name: 'New name' } }]));
    try {
      const old = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
      now.mockReturnValue(2_000);
      const forced = NexusUserStreamService.fetchByIds({ user_ids: ['bob'], force: true });
      const refreshed = await forced;
      expect(refreshed).toEqual([{ details: { id: 'bob', name: 'New name' } }]);
      expect(getNexusResponseStartedAt(refreshed)).toBe(2_000);
      running.resolve(nexusResponse([{ details: { id: 'bob', name: 'Old name' } }]));
      expect(await old).toEqual([{ details: { id: 'bob', name: 'Old name' } }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  describe.each(['users', 'posts'] as const)('exact %s queries before overlapping batches', (kind) => {
    beforeEach(() => {
      mockFetch.mockReset();
    });
    const ids = kind === 'users' ? ['alice', 'bob'] : ['alice:one', 'bob:two'];
    const record = (id: string, version: string) =>
      kind === 'users'
        ? { details: { id, name: version } }
        : { details: { author: id.split(':')[0], id: id.split(':')[1], content: version } };
    const fetchIds = (requested: string[], force = false) =>
      kind === 'users'
        ? NexusUserStreamService.fetchByIds({ user_ids: requested, force })
        : NexusPostStreamService.fetchByIds({ post_ids: requested, force });
    const exactQueryKey = () =>
      buildNexusQueryKey({
        url: `${getNexusUrl()}/v0/stream/${kind}/by_ids`,
        method: HttpMethod.POST,
        body: JSON.stringify(
          kind === 'users' ? { user_ids: [ids[1]] } : { post_ids: [ids[1]], include_attachment_metadata: true },
        ),
      });

    it('joins an active batch when an idle exact query has only an error', async () => {
      const running = Promise.withResolvers<Response>();
      mockFetch
        .mockResolvedValueOnce(new Response('Bad request', { status: 400 }))
        .mockReturnValueOnce(running.promise)
        .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Unexpected separate request')]));
      expect((await Promise.allSettled([fetchIds([ids[1]])]))[0].status).toBe('rejected');
      expect(nexusQueryClient.getQueryState(exactQueryKey())).toMatchObject({
        data: undefined,
        fetchStatus: 'idle',
        status: 'error',
      });
      const batch = fetchIds(ids);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
      const card = fetchIds([ids[1]]);
      running.resolve(nexusResponse([record(ids[1], 'Shared batch')]));

      const [, result] = await Promise.all([batch, card]);
      expect(result).toEqual([record(ids[1], 'Shared batch')]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it.each(['older record', 'omitted record'])(
      'returns the completed exact refresh before a pending batch with an %s',
      async (olderResult) => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const running = Promise.withResolvers<Response>();
        const refreshedRecords = [record(ids[1], 'Refreshed')];
        mockFetch.mockReturnValueOnce(running.promise).mockResolvedValueOnce(nexusResponse(refreshedRecords));
        const old = fetchIds(ids);
        now.mockReturnValue(2_000);
        const refreshed = await fetchIds([ids[1]], true);
        now.mockReturnValue(3_000);
        const resolved = vi.fn();
        const ordinary = fetchIds([ids[1]]).then(resolved);
        try {
          await vi.waitFor(() => expect(resolved).toHaveBeenCalledOnce());
          expect(resolved.mock.calls[0][0]).toBe(refreshed);
          expect(getNexusResponseStartedAt(resolved.mock.calls[0][0])).toBe(2_000);
          expect(mockFetch).toHaveBeenCalledTimes(2);
        } finally {
          running.resolve(nexusResponse(olderResult === 'older record' ? [record(ids[1], 'Older')] : []));
          await Promise.all([old, ordinary]);
          now.mockRestore();
        }
      },
    );

    it.each(['pending', 'settled'])(
      'preserves active batch ownership when an exact cache-hit promise is %s',
      async (cachedState) => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const thirdId = kind === 'users' ? 'carol' : 'carol:three';
        const running = Promise.withResolvers<Response>();
        mockFetch
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
          .mockReturnValueOnce(running.promise)
          .mockResolvedValueOnce(nexusResponse([record(thirdId, 'Third')]));
        const cached = await fetchIds([ids[1]]);
        now.mockReturnValue(2_000);
        const old = fetchIds(ids);
        now.mockReturnValue(3_000);
        const exact = fetchIds([ids[1]]);
        if (cachedState === 'settled') await exact;
        const overlap = fetchIds([ids[1], thirdId]);
        try {
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
          const requested = JSON.parse(mockFetch.mock.calls[2][1].body);
          expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([thirdId]);
          expect(await exact).toBe(cached);
          expect(getNexusResponseStartedAt(await exact)).toBe(1_000);
        } finally {
          running.resolve(nexusResponse([record(ids[1], 'Active batch')]));
          await Promise.all([old, exact, overlap]);
          now.mockRestore();
        }
        expect(await overlap).toEqual([record(ids[1], 'Active batch'), record(thirdId, 'Third')]);
        expect(getNexusResponseStartedAt(await overlap)).toBe(2_000);
      },
    );

    it.each(['fetching', 'paused'] as const)(
      'preserves active batch ownership when a fresh exact query is also %s',
      async (fetchStatus) => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const thirdId = kind === 'users' ? 'carol' : 'carol:three';
        const running = Promise.withResolvers<Response>();
        const refreshing = Promise.withResolvers<Response>();
        mockFetch
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
          .mockReturnValueOnce(running.promise)
          .mockReturnValueOnce(refreshing.promise)
          .mockResolvedValueOnce(nexusResponse([record(thirdId, 'Third')]));
        const cached = await fetchIds([ids[1]]);
        now.mockReturnValue(2_000);
        const old = fetchIds(ids);
        nexusQueryClient.mount();
        if (fetchStatus === 'paused') onlineManager.setOnline(false);
        now.mockReturnValue(3_000);
        const forced = fetchIds([ids[1]], true);
        let overlap: ReturnType<typeof fetchIds> | undefined;
        try {
          await vi.waitFor(() =>
            expect(nexusQueryClient.getQueryState(exactQueryKey())?.fetchStatus).toBe(fetchStatus),
          );
          const exact = await fetchIds([ids[1]]);
          expect(exact).toBe(cached);
          expect(getNexusResponseStartedAt(exact)).toBe(1_000);
          onlineManager.setOnline(true);
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
          overlap = fetchIds([ids[1], thirdId]);
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
          const requested = JSON.parse(mockFetch.mock.calls[3][1].body);
          expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([thirdId]);
        } finally {
          onlineManager.setOnline(true);
          running.resolve(nexusResponse([record(ids[1], 'Active batch')]));
          refreshing.resolve(nexusResponse([record(ids[1], 'Forced')]));
          await Promise.all([old, forced, overlap]);
          nexusQueryClient.unmount();
          now.mockRestore();
        }
        expect(await overlap).toEqual([record(ids[1], 'Active batch'), record(thirdId, 'Third')]);
      },
    );

    it('keeps a cached missing slice out of the pending registry during a forced refresh', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const thirdId = kind === 'users' ? 'carol' : 'carol:three';
      const running = Promise.withResolvers<Response>();
      const refreshing = Promise.withResolvers<Response>();
      mockFetch
        .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
        .mockReturnValueOnce(running.promise)
        .mockReturnValueOnce(refreshing.promise)
        .mockResolvedValueOnce(nexusResponse([record(ids[1], 'New batch'), record(thirdId, 'Third')]));
      await fetchIds([ids[1]]);
      now.mockReturnValue(2_000);
      const old = fetchIds([ids[0]]);
      now.mockReturnValue(3_000);
      const forced = fetchIds([ids[1]], true);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
      now.mockReturnValue(4_000);
      const assembling = fetchIds(ids);
      const overlap = fetchIds([ids[1], thirdId]);
      try {
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
        const requested = JSON.parse(mockFetch.mock.calls[3][1].body);
        expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([ids[1], thirdId]);
        expect(await overlap).toEqual([record(ids[1], 'New batch'), record(thirdId, 'Third')]);
        expect(getNexusResponseStartedAt(await overlap)).toBe(4_000);
      } finally {
        running.resolve(nexusResponse([record(ids[0], 'Other')]));
        refreshing.resolve(nexusResponse([record(ids[1], 'Forced')]));
        await Promise.all([old, forced, assembling, overlap]);
        now.mockRestore();
      }
      expect(await assembling).toEqual([record(ids[0], 'Other'), record(ids[1], 'Cached')]);
      expect(getNexusResponseStartedAt(await assembling)).toBe(1_000);
    });

    it('shares an actual paused exact refetch after it resumes', async () => {
      const refreshing = Promise.withResolvers<Response>();
      mockFetch
        .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
        .mockReturnValueOnce(refreshing.promise)
        .mockResolvedValueOnce(nexusResponse([record(ids[0], 'Other')]));
      await fetchIds([ids[1]]);
      await nexusQueryClient.invalidateQueries({ queryKey: exactQueryKey(), exact: true });
      // Mount only to drive this test's explicit reconnect; the registry itself
      // neither mounts the client nor resumes paused queries.
      nexusQueryClient.mount();
      onlineManager.setOnline(false);
      const exact = fetchIds([ids[1]]);
      let overlap: ReturnType<typeof fetchIds> | undefined;
      try {
        await vi.waitFor(() => expect(nexusQueryClient.getQueryState(exactQueryKey())?.fetchStatus).toBe('paused'));
        onlineManager.setOnline(true);
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
        overlap = fetchIds(ids);
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
        const requested = JSON.parse(mockFetch.mock.calls[2][1].body);
        expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([ids[0]]);
      } finally {
        onlineManager.setOnline(true);
        refreshing.resolve(nexusResponse([record(ids[1], 'Refreshed')]));
        await Promise.all([exact, overlap]);
        nexusQueryClient.unmount();
      }
      expect(await overlap).toEqual([record(ids[0], 'Other'), record(ids[1], 'Refreshed')]);
    });

    it.each(['stale', 'invalidated'])(
      'revalidates the %s exact response instead of joining an older overlapping batch',
      async (state) => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const running = Promise.withResolvers<Response>();
        mockFetch
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
          .mockReturnValueOnce(running.promise)
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Revalidated')]));
        await fetchIds([ids[1]]);
        now.mockReturnValue(2_000);
        const old = fetchIds(ids);
        if (state === 'stale') now.mockReturnValue(30_000);
        else await nexusQueryClient.invalidateQueries({ queryKey: exactQueryKey(), exact: true });
        const resolved = vi.fn();
        const ordinary = fetchIds([ids[1]]).then(resolved);
        try {
          await vi.waitFor(() => expect(resolved).toHaveBeenCalledOnce());
          expect(resolved.mock.calls[0][0]).toEqual([record(ids[1], 'Revalidated')]);
          expect(mockFetch).toHaveBeenCalledTimes(3);
        } finally {
          running.resolve(nexusResponse([record(ids[1], 'Older')]));
          await Promise.all([old, ordinary]);
          now.mockRestore();
        }
      },
    );

    it.each(['stale', 'invalidated'])('shares an exact %s refetch with a later overlapping batch', async (state) => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const refreshing = Promise.withResolvers<Response>();
      mockFetch
        .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
        .mockReturnValueOnce(refreshing.promise)
        .mockResolvedValueOnce(nexusResponse([record(ids[0], 'Other')]));
      await fetchIds([ids[1]]);
      if (state === 'stale') now.mockReturnValue(30_000);
      else await nexusQueryClient.invalidateQueries({ queryKey: exactQueryKey(), exact: true });
      const exact = fetchIds([ids[1]]);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
      const overlap = fetchIds(ids);
      try {
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
        const requested = JSON.parse(mockFetch.mock.calls[2][1].body);
        expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([ids[0]]);
      } finally {
        refreshing.resolve(nexusResponse([record(ids[1], 'Refreshed')]));
        await Promise.all([exact, overlap]);
        now.mockRestore();
      }
      expect(await overlap).toEqual([record(ids[0], 'Other'), record(ids[1], 'Refreshed')]);
    });

    it.each(['updated', 'omitted'])(
      'keeps each selected batch authoritative when its newer record is %s',
      async (newerResult) => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const thirdId = kind === 'users' ? 'carol' : 'carol:three';
        const running = Promise.withResolvers<Response>();
        const refreshing = Promise.withResolvers<Response>();
        mockFetch
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
          .mockReturnValueOnce(running.promise)
          .mockReturnValueOnce(refreshing.promise)
          .mockResolvedValueOnce(nexusResponse([record(ids[0], 'Other')]));
        await fetchIds([ids[1]]);
        now.mockReturnValue(2_000);
        const old = fetchIds([ids[1], thirdId]);
        now.mockReturnValue(30_000);
        const exact = fetchIds([ids[1]]);
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
        now.mockReturnValue(31_000);
        const overlap = fetchIds([...ids, thirdId]);
        const newer = newerResult === 'updated' ? [record(ids[1], 'Refreshed')] : [];
        refreshing.resolve(nexusResponse(newer));
        running.resolve(nexusResponse([record(ids[1], 'Older'), record(thirdId, 'Third')]));
        try {
          const [, , result] = await Promise.all([old, exact, overlap]);
          expect(result).toEqual([record(ids[0], 'Other'), ...newer, record(thirdId, 'Third')]);
          expect(getNexusResponseStartedAt(result)).toBe(2_000);
          expect(mockFetch).toHaveBeenCalledTimes(4);
        } finally {
          now.mockRestore();
        }
      },
    );

    it('joins a pending exact forced refresh instead of an older overlapping batch', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const running = Promise.withResolvers<Response>();
      const refreshing = Promise.withResolvers<Response>();
      mockFetch.mockReturnValueOnce(running.promise).mockReturnValueOnce(refreshing.promise);
      const old = fetchIds(ids);
      now.mockReturnValue(2_000);
      const forced = fetchIds([ids[1]], true);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
      now.mockReturnValue(3_000);
      const resolved = vi.fn();
      const ordinary = fetchIds([ids[1]]).then(resolved);
      refreshing.resolve(nexusResponse([record(ids[1], 'Refreshed')]));
      const refreshed = await forced;
      try {
        await vi.waitFor(() => expect(resolved).toHaveBeenCalledOnce());
        expect(resolved.mock.calls[0][0]).toBe(refreshed);
        expect(getNexusResponseStartedAt(resolved.mock.calls[0][0])).toBe(2_000);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        running.resolve(nexusResponse([record(ids[1], 'Older')]));
        await Promise.all([old, ordinary]);
        now.mockRestore();
      }
    });
  });

  it('fetches a joined caller independently after a shared batch fails', async () => {
    const running = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(running.promise).mockResolvedValueOnce(nexusResponse([{ details: { id: 'bob' } }]));
    const original = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
    const joined = NexusUserStreamService.fetchByIds({ user_ids: ['bob'] });
    const failures = Promise.allSettled([original, joined]);
    running.resolve(new Response('Bad request', { status: 400 }));

    expect((await failures).map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(await NexusUserStreamService.fetchByIds({ user_ids: ['bob'] })).toEqual([{ details: { id: 'bob' } }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a failed fallback request', async () => {
    const running = Promise.withResolvers<Response>();
    mockFetch
      .mockReturnValueOnce(running.promise)
      .mockResolvedValueOnce(nexusResponse([{ details: { id: 'carol' } }]))
      .mockResolvedValueOnce(new Response('Bad request', { status: 400 }));
    const original = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
    const overlap = NexusUserStreamService.fetchByIds({ user_ids: ['bob', 'carol'] });
    const failures = Promise.allSettled([original, overlap]);
    running.resolve(new Response('Bad request', { status: 400 }));

    expect((await failures).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(mockFetch.mock.calls[2][1].body).user_ids).toEqual(['bob']);
  });

  it('fetches IDs from multiple failed joined batches in one request', async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    mockFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce(nexusResponse([{ details: { id: 'carol' } }]))
      .mockResolvedValueOnce(nexusResponse([{ details: { id: 'bob' } }, { details: { id: 'dave' } }]));
    const originals = Promise.allSettled([
      NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] }),
      NexusUserStreamService.fetchByIds({ user_ids: ['dave'] }),
    ]);
    const overlap = NexusUserStreamService.fetchByIds({ user_ids: ['bob', 'carol', 'dave'] });
    first.resolve(new Response('Bad request', { status: 400 }));
    second.resolve(new Response('Bad request', { status: 400 }));

    expect((await originals).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(await overlap).toEqual([
      { details: { id: 'bob' } },
      { details: { id: 'carol' } },
      { details: { id: 'dave' } },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(JSON.parse(mockFetch.mock.calls[3][1].body).user_ids).toEqual(['bob', 'dave']);
  });

  it('does not join requests removed by a query-cache clear before their promises settle', async () => {
    const running = Promise.withResolvers<Response>();
    mockFetch
      .mockReturnValueOnce(running.promise)
      .mockResolvedValueOnce(nexusResponse([{ details: { id: 'bob', name: 'New session' } }]));
    const old = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
    const oldResult = Promise.allSettled([old]);
    nexusQueryClient.clear();
    const current = NexusUserStreamService.fetchByIds({ user_ids: ['bob'] });
    running.resolve(nexusResponse([{ details: { id: 'bob', name: 'Old session' } }]));

    expect(await current).toEqual([{ details: { id: 'bob', name: 'New session' } }]);
    expect((await oldResult)[0].status).toBe('rejected');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
