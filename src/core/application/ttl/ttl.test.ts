import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagCacheApplication } from '@/application/tag/tag-cache';
import { TtlApplication } from '@/application/ttl/ttl';
import { TAG_REFRESH_MAX_CONCURRENCY } from '@/config/tags';
import { getTtlRetryDelayMs } from '@/libs/runtime-config/runtime-config';
import type { Pubky } from '@/models/models.types';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LocalPostService } from '@/services/local/post/post';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserService } from '@/services/local/user/user';
import type { NexusFileDetails, NexusPost, NexusUser } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { postStreamApi } from '@/services/nexus/stream/posts/postStream.api';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { userStreamApi } from '@/services/nexus/stream/users/userStream.api';
import { asOpaque } from '@/test-utils/type-assertions';

vi.mock('@/application/tag/tag-cache');
vi.mock('@/services/local/tag/tag-cache');

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nexus/nexus.utils')>();
  return {
    ...actual,
    queryNexus: vi.fn(),
  };
});

const mockQueryNexus = vi.mocked(queryNexus);

describe('TtlApplication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(LocalTagCacheService.captureRevisions).mockResolvedValue(new Map());
    vi.mocked(LocalTagCacheService.findStale).mockResolvedValue([]);
    vi.mocked(TagCacheApplication.refreshExpanded).mockResolvedValue(undefined);
    vi.mocked(TagCacheApplication.refreshStale).mockResolvedValue(undefined);
  });

  it('does not expire healthy post/profile details because their tag endpoint failed', async () => {
    const now = Date.now();
    vi.spyOn(PostTtlModel, 'findByIds').mockResolvedValue([
      asOpaque<PostTtlModel>({ id: 'author:post', lastUpdatedAt: now }),
    ]);
    vi.spyOn(UserTtlModel, 'findByIds').mockResolvedValue([asOpaque<UserTtlModel>({ id: 'user', lastUpdatedAt: now })]);
    vi.mocked(LocalTagCacheService.findStale).mockResolvedValue(['author:post', 'user']);
    expect(await TtlApplication.findStalePostsByIds({ postIds: ['author:post'], ttlMs: 1000 })).toEqual([]);
    expect(await TtlApplication.findStaleUsersByIds({ userIds: ['user'], ttlMs: 1000 })).toEqual([]);
  });

  it('retries eligible tag windows separately and contains a failed window', async () => {
    vi.mocked(LocalTagCacheService.findStale).mockResolvedValue(['stale']);
    vi.mocked(TagCacheApplication.refreshStale).mockRejectedValueOnce(new Error('offline'));
    await expect(
      TtlApplication.refreshStaleTags({ kind: 'user', ids: ['fresh', 'stale'], ttlMs: 1000 }),
    ).resolves.toBeUndefined();
    expect(TagCacheApplication.refreshStale).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', id: 'stale' }),
      1000,
    );
  });

  it('discards a tag retry selection after its viewer session changes', async () => {
    vi.mocked(LocalTagCacheService.findStale).mockResolvedValue(['stale']);
    await TtlApplication.refreshStaleTags({ kind: 'user', ids: ['stale'], ttlMs: 1000, isCurrent: () => false });
    expect(TagCacheApplication.refreshStale).not.toHaveBeenCalled();
  });

  describe('findStalePostsByIds', () => {
    it('returns stale ids when TTL record is missing or expired', async () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const postIds = ['alice:1', 'bob:2', 'carol:3'];
      vi.spyOn(PostTtlModel, 'findByIds').mockResolvedValue([
        // alice fresh
        asOpaque<PostTtlModel>({ id: 'alice:1', lastUpdatedAt: now - 1_000 }),
        // bob stale
        asOpaque<PostTtlModel>({ id: 'bob:2', lastUpdatedAt: now - 10_000 }),
        // carol missing
      ]);

      const stale = await TtlApplication.findStalePostsByIds({ postIds, ttlMs: 5_000 });
      expect(stale.sort()).toEqual(['bob:2', 'carol:3'].sort());
    });
  });

  describe('forceRefreshPostsByIds', () => {
    it('does not mark a batch fresh before its attachment metadata can be saved', async () => {
      const metadata = asOpaque<NexusFileDetails>({ uri: 'pubky://author/pub/pubky.app/files/image' });
      const batch = [
        asOpaque<NexusPost>({
          details: { author: 'author', id: 'post' },
          tags: [],
          relationships: { reposted: null },
          attachments_metadata: [metadata],
        }),
      ];
      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(batch);
      const persisted = vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(undefined);
      const failure = new Error('file table unavailable');
      const files = vi
        .spyOn(FileApplication, 'persistFiles')
        .mockRejectedValueOnce(failure)
        .mockResolvedValue(undefined);
      vi.spyOn(PostStreamApplication, 'fetchOriginalPostsByUris').mockResolvedValue(undefined);
      await expect(TtlApplication.forceRefreshPostsByIds({ postIds: ['author:post'] })).rejects.toBe(failure);
      expect(persisted).not.toHaveBeenCalled();
      await TtlApplication.forceRefreshPostsByIds({ postIds: ['author:post'] });
      expect(files).toHaveBeenLastCalledWith([metadata]);
      expect(persisted).toHaveBeenCalledOnce();
    });

    it('discards the post write when its session changes while attachments are being saved', async () => {
      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([]);
      let current = true;
      vi.spyOn(FileApplication, 'persistFiles').mockImplementation(async () => {
        current = false;
      });
      const persisted = vi.spyOn(LocalStreamPostsService, 'persistPosts');
      await TtlApplication.forceRefreshPostsByIds({ postIds: ['author:post'], isCurrent: () => current });
      expect(persisted).not.toHaveBeenCalled();
    });

    it('fetches and persists posts (TTL handled by persistPosts)', async () => {
      const viewerId = 'viewer' as Pubky;

      const postIds = ['alice:1', 'bob:2'];
      vi.spyOn(postStreamApi, 'postsByIds').mockReturnValue({
        url: '/stream/posts/by_ids',
        body: { post_ids: postIds, viewer_id: viewerId },
      } as ReturnType<typeof postStreamApi.postsByIds>);

      const nexusPosts: NexusPost[] = [
        {
          details: {
            id: '1',
            author: 'alice' as Pubky,
            content: '',
            indexed_at: 0,
            kind: 'note',
            uri: '',
            attachments: null,
          },
          counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
          tags: [],
          relationships: { replied: null, reposted: null, mentioned: [] },
          bookmark: null,
        },
        {
          details: {
            id: '2',
            author: 'bob' as Pubky,
            content: '',
            indexed_at: 0,
            kind: 'note',
            uri: '',
            attachments: null,
          },
          counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
          tags: [],
          relationships: { replied: null, reposted: null, mentioned: [] },
          bookmark: null,
        },
      ];

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(nexusPosts);
      const persistPostsSpy = vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(undefined);
      const persistFilesSpy = vi.spyOn(FileApplication, 'persistFiles').mockResolvedValue(undefined);
      vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);

      await TtlApplication.forceRefreshPostsByIds({ postIds, viewerId });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        force: true,
        url: '/stream/posts/by_ids',
        method: 'POST',
        body: JSON.stringify({ post_ids: postIds, viewer_id: viewerId }),
      });
      // persistPosts handles TTL updates internally
      expect(persistPostsSpy).toHaveBeenCalledWith({
        posts: nexusPosts,
        tagGuard: expect.objectContaining({ revisions: expect.any(Map) }),
        refreshGuard: { fetchStartedAt: expect.any(Number) },
      });
      expect(persistFilesSpy).toHaveBeenCalledWith([]);
    });

    it('hands persistPosts the fetch start so locally newer rows are kept atomically', async () => {
      const viewerId = 'viewer' as Pubky;
      const postIds = ['alice:1', 'bob:2'];
      vi.spyOn(postStreamApi, 'postsByIds').mockReturnValue({
        url: '/stream/posts/by_ids',
        body: { post_ids: postIds, viewer_id: viewerId },
      } as ReturnType<typeof postStreamApi.postsByIds>);

      const nexusPost = (author: string, id: string): NexusPost => ({
        details: { id, author: author as Pubky, content: '', indexed_at: 0, kind: 'note', uri: '', attachments: null },
        counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
        tags: [],
        relationships: { replied: null, reposted: null, mentioned: [] },
        bookmark: null,
      });
      const nexusPosts = [nexusPost('alice', '1'), nexusPost('bob', '2')];
      mockQueryNexus.mockResolvedValue(nexusPosts);
      const persistPostsSpy = vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(undefined);
      vi.spyOn(PostStreamApplication, 'fetchOriginalPostsByUris').mockResolvedValue(undefined);

      const fetchStartedAt = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(fetchStartedAt);

      await TtlApplication.forceRefreshPostsByIds({ postIds, viewerId });

      // The "was this row edited while the fetch was in flight" check lives in
      // persistPosts, inside the same transaction as the writes, so no
      // local-first edit can slip between the check and the bulk save.
      expect(persistPostsSpy).toHaveBeenCalledTimes(1);
      expect(persistPostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ posts: nexusPosts, refreshGuard: { fetchStartedAt } }),
      );
    });

    it('does not persist when fetch fails', async () => {
      const viewerId = 'viewer' as Pubky;
      vi.spyOn(postStreamApi, 'postsByIds').mockReturnValue({
        url: '/stream/posts/by_ids',
        body: { post_ids: ['alice:1'], viewer_id: viewerId },
      } as ReturnType<typeof postStreamApi.postsByIds>);

      mockQueryNexus.mockRejectedValue(new Error('Network down'));
      const persistPostsSpy = vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(undefined);

      await expect(TtlApplication.forceRefreshPostsByIds({ postIds: ['alice:1'], viewerId })).rejects.toThrow(
        'Network down',
      );
      expect(persistPostsSpy).not.toHaveBeenCalled();
    });

    it('fetches original posts for reposts when refreshing', async () => {
      const viewerId = 'viewer' as Pubky;
      const originalAuthor = 'original-author';
      const originalPostId = 'original-post-123';
      const originalPostUri = `pubky://${originalAuthor}/pub/pubky.app/posts/${originalPostId}`;

      // The repost that will be refreshed
      const repostNexusPost: NexusPost = {
        details: {
          id: 'repost-1',
          author: 'reposter' as Pubky,
          content: '',
          indexed_at: 0,
          kind: 'short',
          uri: 'pubky://reposter/pub/pubky.app/posts/repost-1',
          attachments: null,
        },
        counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
        tags: [],
        relationships: { replied: null, reposted: originalPostUri, mentioned: [] },
        bookmark: null,
      };

      vi.spyOn(postStreamApi, 'postsByIds').mockReturnValue({
        url: '/stream/posts/by_ids',
        body: { post_ids: ['reposter:repost-1'], viewer_id: viewerId },
      } as ReturnType<typeof postStreamApi.postsByIds>);

      mockQueryNexus.mockResolvedValue([repostNexusPost]);
      vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(undefined);
      vi.spyOn(FileApplication, 'persistFiles').mockResolvedValue(undefined);
      vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);

      // Mock the shared helper to verify it's called with correct URIs
      const fetchOriginalsSpy = vi
        .spyOn(PostStreamApplication, 'fetchOriginalPostsByUris')
        .mockResolvedValue(undefined);

      await TtlApplication.forceRefreshPostsByIds({ postIds: ['reposter:repost-1'], viewerId });

      // Verify fetchOriginalPostsByUris is called with the reposted URI
      expect(fetchOriginalsSpy).toHaveBeenCalledWith({
        repostedUris: [originalPostUri],
        viewerId,
      });
    });

    it('does not call fetchOriginalPostsByUris when post is not a repost', async () => {
      const viewerId = 'viewer' as Pubky;

      const regularPost: NexusPost = {
        details: {
          id: 'post-1',
          author: 'alice' as Pubky,
          content: 'Regular post',
          indexed_at: 0,
          kind: 'short',
          uri: 'pubky://alice/pub/pubky.app/posts/post-1',
          attachments: null,
        },
        counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
        tags: [],
        relationships: { replied: null, reposted: null, mentioned: [] },
        bookmark: null,
      };

      vi.spyOn(postStreamApi, 'postsByIds').mockReturnValue({
        url: '/stream/posts/by_ids',
        body: { post_ids: ['alice:post-1'], viewer_id: viewerId },
      } as ReturnType<typeof postStreamApi.postsByIds>);

      mockQueryNexus.mockResolvedValue([regularPost]);
      vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(undefined);
      vi.spyOn(FileApplication, 'persistFiles').mockResolvedValue(undefined);
      vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);

      const fetchOriginalsSpy = vi
        .spyOn(PostStreamApplication, 'fetchOriginalPostsByUris')
        .mockResolvedValue(undefined);

      await TtlApplication.forceRefreshPostsByIds({ postIds: ['alice:post-1'], viewerId });

      // Verify fetchOriginalPostsByUris is called with empty array (no reposts)
      expect(fetchOriginalsSpy).toHaveBeenCalledWith({
        repostedUris: [],
        viewerId,
      });
    });
  });

  describe('forceRefreshUsersByIds', () => {
    it('fetches and persists users (TTL handled by persistUsers)', async () => {
      const userIds = ['alice' as Pubky, 'bob' as Pubky];
      vi.spyOn(userStreamApi, 'usersByIds').mockReturnValue({
        url: '/stream/users/by_ids',
        body: { user_ids: userIds, viewer_id: undefined },
      } as ReturnType<typeof userStreamApi.usersByIds>);

      const nexusUsers: NexusUser[] = [
        {
          details: {
            id: 'alice' as Pubky,
            name: '',
            bio: '',
            links: null,
            status: null,
            image: null,
            indexed_at: 0,
          },
          counts: {
            tagged: 0,
            tags: 0,
            unique_tags: 0,
            posts: 0,
            replies: 0,
            following: 0,
            followers: 0,
            friends: 0,
            collections: 0,
            bookmarks: 0,
          },
          tags: [],
          relationship: { following: false, followed_by: false },
        },
        {
          details: {
            id: 'bob' as Pubky,
            name: '',
            bio: '',
            links: null,
            status: null,
            image: null,
            indexed_at: 0,
          },
          counts: {
            tagged: 0,
            tags: 0,
            unique_tags: 0,
            posts: 0,
            replies: 0,
            following: 0,
            followers: 0,
            friends: 0,
            collections: 0,
            bookmarks: 0,
          },
          tags: [],
          relationship: { following: false, followed_by: false },
        },
      ];

      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(nexusUsers);
      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);
      const viewerId = 'viewer' as Pubky;

      await TtlApplication.forceRefreshUsersByIds({ userIds, viewerId });

      expect(fetchByIdsSpy).toHaveBeenCalledWith({ user_ids: userIds, force: true, viewer_id: viewerId });
      // persistUsers handles TTL updates internally; the viewer keeps relationship rows viewer-relative
      expect(persistUsersSpy).toHaveBeenCalledWith(
        nexusUsers,
        expect.objectContaining({ revisions: expect.any(Map), viewerId }),
      );
    });

    it('does not persist when fetch fails', async () => {
      const userIds = ['alice' as Pubky];

      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockRejectedValue(new Error('Network down'));
      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);

      await expect(TtlApplication.forceRefreshUsersByIds({ userIds })).rejects.toThrow('Network down');
      expect(persistUsersSpy).not.toHaveBeenCalled();
    });
  });

  describe('ids omitted from a batch response', () => {
    const nexusPost = (author: string, id: string): NexusPost => ({
      details: { id, author: author as Pubky, content: '', indexed_at: 0, kind: 'note', uri: '', attachments: null },
      counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
      tags: [],
      relationships: { replied: null, reposted: null, mentioned: [] },
      bookmark: null,
    });
    const nexusUser = (id: string): NexusUser => ({
      details: { id: id as Pubky, name: '', bio: '', links: null, status: null, image: null, indexed_at: 0 },
      counts: {
        tagged: 0,
        tags: 0,
        unique_tags: 0,
        posts: 0,
        replies: 0,
        following: 0,
        followers: 0,
        friends: 0,
        collections: 0,
        bookmarks: 0,
      },
      tags: [],
      relationship: { following: false, followed_by: false },
    });

    it('parks a post Nexus omitted for the retry delay instead of every tick', async () => {
      const postIds = ['alice:1', 'bob:2'];
      vi.spyOn(postStreamApi, 'postsByIds').mockReturnValue({
        url: '/stream/posts/by_ids',
        body: { post_ids: postIds },
      } as ReturnType<typeof postStreamApi.postsByIds>);
      mockQueryNexus.mockResolvedValue([nexusPost('alice', '1')]);
      vi.spyOn(FileApplication, 'persistFiles').mockResolvedValue(undefined);
      vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(undefined);
      vi.spyOn(PostStreamApplication, 'fetchOriginalPostsByUris').mockResolvedValue(undefined);
      const deferSpy = vi.spyOn(LocalPostService, 'upsertTtlWithDelay').mockResolvedValue(undefined);

      await TtlApplication.forceRefreshPostsByIds({ postIds });

      expect(deferSpy).toHaveBeenCalledExactlyOnceWith('bob:2', getTtlRetryDelayMs(), {
        unlessWrittenSince: expect.any(Number),
      });
    });

    it('parks a user Nexus omitted for the retry delay and still reports the refreshed ones', async () => {
      const userIds = ['alice' as Pubky, 'bob' as Pubky];
      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([nexusUser('alice')]);
      vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);
      const deferSpy = vi.spyOn(LocalUserService, 'upsertTtlWithDelay').mockResolvedValue(undefined);

      const refreshed = await TtlApplication.forceRefreshUsersByIds({ userIds });

      expect(refreshed).toEqual(['alice']);
      expect(deferSpy).toHaveBeenCalledExactlyOnceWith('bob', getTtlRetryDelayMs(), {
        unlessWrittenSince: expect.any(Number),
      });
    });

    it('stamps the fetch start before reading tag revisions so a write during that read is kept', async () => {
      const postIds = ['alice:1', 'bob:2'];
      vi.spyOn(postStreamApi, 'postsByIds').mockReturnValue({
        url: '/stream/posts/by_ids',
        body: { post_ids: postIds },
      } as ReturnType<typeof postStreamApi.postsByIds>);
      mockQueryNexus.mockResolvedValue([nexusPost('alice', '1')]);
      vi.spyOn(FileApplication, 'persistFiles').mockResolvedValue(undefined);
      vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(undefined);
      vi.spyOn(PostStreamApplication, 'fetchOriginalPostsByUris').mockResolvedValue(undefined);
      const deferSpy = vi.spyOn(LocalPostService, 'upsertTtlWithDelay').mockResolvedValue(undefined);
      const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      vi.mocked(LocalTagCacheService.captureRevisions).mockImplementation(async () => {
        clock.mockReturnValue(2_000); // a local edit lands while revisions are being read
        return new Map();
      });

      await TtlApplication.forceRefreshPostsByIds({ postIds });

      expect(deferSpy).toHaveBeenCalledExactlyOnceWith('bob:2', getTtlRetryDelayMs(), { unlessWrittenSince: 1_000 });
    });

    it('stamps the fetch start before reading user tag revisions as well', async () => {
      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([nexusUser('alice')]);
      vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);
      const deferSpy = vi.spyOn(LocalUserService, 'upsertTtlWithDelay').mockResolvedValue(undefined);
      const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      vi.mocked(LocalTagCacheService.captureRevisions).mockImplementation(async () => {
        clock.mockReturnValue(2_000);
        return new Map();
      });

      await TtlApplication.forceRefreshUsersByIds({ userIds: ['alice' as Pubky, 'bob' as Pubky] });

      expect(deferSpy).toHaveBeenCalledExactlyOnceWith('bob', getTtlRetryDelayMs(), { unlessWrittenSince: 1_000 });
    });

    it('does not park anything when the batch returned every id', async () => {
      const userIds = ['alice' as Pubky];
      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([nexusUser('alice')]);
      vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);
      const deferSpy = vi.spyOn(LocalUserService, 'upsertTtlWithDelay').mockResolvedValue(undefined);

      await TtlApplication.forceRefreshUsersByIds({ userIds });

      expect(deferSpy).not.toHaveBeenCalled();
    });
  });

  describe('tag window refresh concurrency', () => {
    it('keeps at most the configured number of per-entity tag requests in flight', async () => {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
      vi.mocked(LocalTagCacheService.findStale).mockResolvedValue(ids);
      let inFlight = 0;
      let peak = 0;
      const release: (() => void)[] = [];
      vi.mocked(TagCacheApplication.refreshStale).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            release.push(() => {
              inFlight -= 1;
              resolve();
            });
          }),
      );

      const run = TtlApplication.refreshStaleTags({ kind: 'post', ids, ttlMs: 1000 });
      await vi.waitFor(() =>
        expect(TagCacheApplication.refreshStale).toHaveBeenCalledTimes(TAG_REFRESH_MAX_CONCURRENCY),
      );
      release.shift()!();
      await vi.waitFor(() =>
        expect(TagCacheApplication.refreshStale).toHaveBeenCalledTimes(TAG_REFRESH_MAX_CONCURRENCY + 1),
      );
      while (release.length > 0) release.shift()!();
      await vi.waitFor(() => expect(TagCacheApplication.refreshStale).toHaveBeenCalledTimes(ids.length));
      while (release.length > 0) release.shift()!();
      await run;

      expect(peak).toBe(TAG_REFRESH_MAX_CONCURRENCY);
    });
  });
});
