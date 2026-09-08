import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagCacheApplication } from '@/application/tag/tag-cache';
import { TtlApplication } from '@/application/ttl/ttl';
import type { Pubky } from '@/models/models.types';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
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
      const persisted = vi
        .spyOn(LocalStreamPostsService, 'persistPosts')
        .mockResolvedValue({ attachmentMetadata: [metadata] });
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
      const persistPostsSpy = vi
        .spyOn(LocalStreamPostsService, 'persistPosts')
        .mockResolvedValue(
          asOpaque<Awaited<ReturnType<typeof LocalStreamPostsService.persistPosts>>>({ attachmentMetadata: [] }),
        );
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
      });
      expect(persistFilesSpy).toHaveBeenCalledWith([]);
    });

    it('does not persist when fetch fails', async () => {
      const viewerId = 'viewer' as Pubky;
      vi.spyOn(postStreamApi, 'postsByIds').mockReturnValue({
        url: '/stream/posts/by_ids',
        body: { post_ids: ['alice:1'], viewer_id: viewerId },
      } as ReturnType<typeof postStreamApi.postsByIds>);

      mockQueryNexus.mockRejectedValue(new Error('Network down'));
      const persistPostsSpy = vi
        .spyOn(LocalStreamPostsService, 'persistPosts')
        .mockResolvedValue({ attachmentMetadata: [] });

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
      vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(
        asOpaque<Awaited<ReturnType<typeof LocalStreamPostsService.persistPosts>>>({ attachmentMetadata: [] }),
      );
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
      vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue(
        asOpaque<Awaited<ReturnType<typeof LocalStreamPostsService.persistPosts>>>({ attachmentMetadata: [] }),
      );
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

      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(nexusUsers);
      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);

      await TtlApplication.forceRefreshUsersByIds({ userIds });

      // persistUsers handles TTL updates internally
      expect(persistUsersSpy).toHaveBeenCalledWith(nexusUsers, expect.objectContaining({ revisions: expect.any(Map) }));
    });

    it('does not persist when fetch fails', async () => {
      const userIds = ['alice' as Pubky];

      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockRejectedValue(new Error('Network down'));
      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);

      await expect(TtlApplication.forceRefreshUsersByIds({ userIds })).rejects.toThrow('Network down');
      expect(persistUsersSpy).not.toHaveBeenCalled();
    });
  });
});
