import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { NexusPostService } from '@/services/nexus/post/post';
import { NexusUserService } from '@/services/nexus/user/user';
import { TagCacheApplication } from './tag-cache';

vi.mock('@/services/local/tag/tag-cache');
vi.mock('@/services/nexus/post/post');
vi.mock('@/services/nexus/user/user');

const request = { kind: 'user', id: 'profile', viewerId: 'viewer' } as const;
const tags = (count: number, start = 0): NexusTag[] =>
  Array.from({ length: count }, (_, i) => ({
    label: `tag-${start + i}`,
    taggers: [],
    taggers_count: 1,
    relationship: false,
  }));
const record = (cursor = 5, revision = 1): TagCollectionModelSchema<string> => ({
  id: request.id,
  tags: tags(cursor),
  cache: { cursor, revision, exhausted: false, fetchedAt: Date.now(), viewerId: 'viewer' },
});

describe('TagCacheApplication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(LocalTagCacheService.read).mockResolvedValue(record());
    vi.mocked(LocalTagCacheService.savePage).mockResolvedValue(true);
    vi.mocked(NexusUserService.tags).mockResolvedValue(tags(20, 5));
    vi.mocked(NexusPostService.getPostTags).mockResolvedValue(tags(3, 5));
  });

  it.each([record(), { id: request.id, tags: [] }])(
    'does not fetch an initialized cache on revisit',
    async (cached) => {
      vi.mocked(LocalTagCacheService.read).mockResolvedValue(cached);
      await TagCacheApplication.getOrFetch({ ...request, viewerId: cached.cache?.viewerId ?? undefined });
      expect(NexusUserService.tags).not.toHaveBeenCalled();
    },
  );

  it.each([null, { id: request.id, tags: [], cache: { ...record().cache!, initialized: false } }])(
    'initializes missing tags, including invalidated placeholders',
    async (cached) => {
      vi.mocked(LocalTagCacheService.read).mockResolvedValue(cached);
      await TagCacheApplication.getOrFetch(request);
      expect(NexusUserService.tags).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ skip_tags: 0, limit_tags: 20 }),
      );
    },
  );

  it.each(['user', 'post'] as const)('paginates %s from a five-tag preview', async (kind) => {
    await TagCacheApplication.fetchNext({ ...request, kind });
    expect(LocalTagCacheService.savePage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ skip: 5, limit: kind === 'post' ? 3 : 20, revision: 1 }),
    );
  });

  it('retries pagination against the accepted preview revision before resolving', async () => {
    vi.mocked(LocalTagCacheService.read).mockResolvedValueOnce(record()).mockResolvedValue(record(5, 2));
    vi.mocked(LocalTagCacheService.savePage).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await TagCacheApplication.fetchNext(request);
    expect(LocalTagCacheService.savePage).toHaveBeenCalledTimes(2);
    expect(NexusUserService.tags).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }));
    expect(LocalTagCacheService.savePage).toHaveBeenLastCalledWith(
      request,
      tags(20, 5),
      expect.objectContaining({ skip: 5, revision: 2 }),
    );
  });

  it('queues one useful next page behind a pending refresh', async () => {
    const refreshPage = Promise.withResolvers<NexusTag[]>();
    vi.mocked(NexusUserService.tags).mockReturnValueOnce(refreshPage.promise);
    const refresh = TagCacheApplication.forceRefresh(request);
    await vi.waitFor(() => expect(NexusUserService.tags).toHaveBeenCalledTimes(1));
    const next = TagCacheApplication.fetchNext(request);
    const duplicate = TagCacheApplication.fetchNext(request);
    vi.mocked(LocalTagCacheService.read).mockResolvedValue(record(20, 2));
    refreshPage.resolve(tags(20));
    await Promise.all([refresh, next, duplicate]);
    expect(NexusUserService.tags).toHaveBeenCalledTimes(2);
    expect(NexusUserService.tags).toHaveBeenLastCalledWith(expect.objectContaining({ skip_tags: 20, limit_tags: 20 }));
  });

  it('bounds revision contention and reports failure instead of silently losing the page', async () => {
    vi.mocked(LocalTagCacheService.savePage).mockResolvedValue(false);
    await expect(TagCacheApplication.fetchNext(request)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(NexusUserService.tags).toHaveBeenCalledTimes(3);
  });

  it('does not execute queued work after its viewer session ends', async () => {
    let current = true;
    const scoped = { ...request, isCurrent: () => current };
    const page = Promise.withResolvers<NexusTag[]>();
    vi.mocked(NexusUserService.tags).mockReturnValueOnce(page.promise);
    const refresh = TagCacheApplication.forceRefresh(scoped);
    await vi.waitFor(() => expect(NexusUserService.tags).toHaveBeenCalledTimes(1));
    const next = TagCacheApplication.fetchNext(scoped);
    current = false;
    page.resolve(tags(20));
    await Promise.all([refresh, next]);
    expect(NexusUserService.tags).toHaveBeenCalledTimes(1);
    expect(LocalTagCacheService.savePage).not.toHaveBeenCalled();
  });

  it('defers a failed expanded refresh while preserving its expected revision and session guard', async () => {
    const isCurrent = () => true;
    vi.mocked(NexusUserService.tags).mockRejectedValueOnce(new Error('offline'));
    await expect(TagCacheApplication.refreshExpanded({ ...request, isCurrent }, 3)).rejects.toThrow('offline');
    expect(LocalTagCacheService.deferRefresh).toHaveBeenCalledWith(
      { ...request, isCurrent },
      {
        revision: 1,
        retryAt: expect.any(Number),
        isCurrent,
      },
    );
    expect(LocalTagCacheService.savePage).not.toHaveBeenCalled();
    expect(LocalTagCacheService.invalidate).not.toHaveBeenCalled();
  });

  it('records the failed refresh revision after waiting for pending pagination', async () => {
    const page = Promise.withResolvers<NexusTag[]>();
    vi.mocked(NexusUserService.tags).mockReturnValueOnce(page.promise).mockRejectedValueOnce(new Error('offline'));
    const next = TagCacheApplication.fetchNext(request);
    await vi.waitFor(() => expect(NexusUserService.tags).toHaveBeenCalledTimes(1));
    const refresh = TagCacheApplication.refreshExpanded(request, 3);
    await vi.waitFor(() => expect(LocalTagCacheService.read).toHaveBeenCalledTimes(2));
    vi.mocked(LocalTagCacheService.read).mockResolvedValue(record(25, 2));
    page.resolve(tags(20, 5));
    await next;
    await expect(refresh).rejects.toThrow('offline');
    expect(LocalTagCacheService.deferRefresh).toHaveBeenCalledExactlyOnceWith(
      request,
      expect.objectContaining({ revision: 2 }),
    );
  });

  it('suppresses background requests during cooldown and retries after it expires', async () => {
    vi.mocked(LocalTagCacheService.read).mockResolvedValue({
      ...record(),
      cache: {
        ...record().cache!,
        fetchedAt: 0,
        retryAt: Date.now() + 60_000,
      },
    });
    await TagCacheApplication.refreshStale(request, 1000);
    await TagCacheApplication.refreshExpanded(request, 3);
    expect(NexusUserService.tags).not.toHaveBeenCalled();
    vi.mocked(LocalTagCacheService.read).mockResolvedValue({
      ...record(),
      cache: {
        ...record().cache!,
        fetchedAt: 0,
        retryAt: Date.now() - 1,
      },
    });
    await TagCacheApplication.refreshStale(request, 1000);
    expect(NexusUserService.tags).toHaveBeenCalledTimes(1);
  });

  it('does not refresh a fresh window in the separate tag pass', async () => {
    await TagCacheApplication.refreshStale(request, 1000);
    expect(NexusUserService.tags).not.toHaveBeenCalled();
  });

  it('refreshes an expanded prefix in bounded requests and persists it once', async () => {
    vi.mocked(LocalTagCacheService.read).mockResolvedValue(record(125));
    vi.mocked(NexusUserService.tags).mockResolvedValueOnce(tags(100)).mockResolvedValueOnce(tags(25, 100));
    await TagCacheApplication.forceRefresh(request);
    expect(NexusUserService.tags).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ skip_tags: 0, limit_tags: 100, force: true }),
    );
    expect(NexusUserService.tags).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skip_tags: 100, limit_tags: 25, force: true }),
    );
    expect(LocalTagCacheService.savePage).toHaveBeenCalledExactlyOnceWith(
      request,
      tags(125),
      expect.objectContaining({ skip: 0, limit: 125 }),
    );
  });

  it('does not persist a partial prefix if a later refresh chunk fails', async () => {
    vi.mocked(LocalTagCacheService.read).mockResolvedValue(record(125));
    vi.mocked(NexusUserService.tags).mockResolvedValueOnce(tags(100)).mockRejectedValueOnce(new Error('offline'));
    await expect(TagCacheApplication.forceRefresh(request)).rejects.toThrow('offline');
    expect(LocalTagCacheService.savePage).not.toHaveBeenCalled();
  });
});
