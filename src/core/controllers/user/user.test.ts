import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FollowResult } from 'pubky-app-specs';
import { UserController } from './user';
import { asOpaque } from '@/test-utils/type-assertions';
import { HttpMethod } from '@/libs/http/http.types';
import { UserApplication } from '@/application/user/user';
import type { Pubky } from '@/models/models.types';
import type { PostStreamTypes } from '@/models/stream/post/postStream.types';
import type { UserCountsModel } from '@/models/user/counts/userCounts';
import { FollowNormalizer } from '@/pipes/follow/follow.normalizer';
import type { NexusTag, NexusTaggers, NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, REACH, SORT } from '@/stores/home/home.types';
import { getStreamId } from '@/stores/home/home.utils';

vi.mock('@/stores/home/home.store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/home/home.store')>();
  const useHomeStoreMock = Object.assign(vi.fn(), {
    getState: vi.fn(),
  });
  return {
    ...actual,
    useHomeStore: useHomeStoreMock,
  };
});

vi.mock('@/stores/home/home.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/home/home.utils')>();
  return {
    ...actual,
    getStreamId: vi.fn(),
  };
});

const mockUseHomeStore = vi.mocked(useHomeStore);
const mockUseHomeStoreGetState = vi.mocked(useHomeStore.getState);
const mockGetStreamId = vi.mocked(getStreamId);

const createMockHomeState = () =>
  asOpaque<ReturnType<typeof useHomeStore.getState>>({
    sort: SORT.TIMELINE,
    reach: REACH.ALL,
    content: CONTENT.ALL,
  });

// Valid 52-character z-base32 encoded pubky IDs for testing
const TEST_PUBKY = {
  USER_1: '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky,
  USER_2: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
};

describe('UserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHomeStore.mockReset();
    mockUseHomeStoreGetState.mockReset();
    mockGetStreamId.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDetails', () => {
    it('should delegate to UserApplication.getDetails', async () => {
      const userId = 'test-user-id';
      const mockUserDetails: NexusUserDetails = {
        id: userId,
        name: 'Test User',
        bio: 'Test bio',
        image: null,
        links: [],
        status: '',
        indexed_at: Date.now(),
      };

      const getDetailsSpy = vi.spyOn(UserApplication, 'getDetails').mockResolvedValue(mockUserDetails);

      const result = await UserController.getDetails({ userId });

      expect(result).toEqual(mockUserDetails);
      expect(getDetailsSpy).toHaveBeenCalledWith({ userId });
    });

    it('should return null when user details not found', async () => {
      const userId = 'non-existent-user';

      vi.spyOn(UserApplication, 'getDetails').mockResolvedValue(null);

      const result = await UserController.getDetails({ userId });

      expect(result).toBeNull();
    });

    it('should propagate errors from application layer', async () => {
      const userId = 'test-user-id';

      vi.spyOn(UserApplication, 'getDetails').mockRejectedValue(new Error('Database error'));

      await expect(UserController.getDetails({ userId })).rejects.toThrow('Database error');
    });
  });

  describe('getManyDetails', () => {
    it('should delegate to UserApplication.getManyDetails', async () => {
      const userIds = ['user1', 'user2'] as Pubky[];
      const mockMap = new Map<Pubky, NexusUserDetails>([
        ['user1' as Pubky, { id: 'user1', name: 'User 1' } as NexusUserDetails],
        ['user2' as Pubky, { id: 'user2', name: 'User 2' } as NexusUserDetails],
      ]);

      const getManyDetailsSpy = vi.spyOn(UserApplication, 'getManyDetails').mockResolvedValue(mockMap);

      const result = await UserController.getManyDetails({ userIds });

      expect(result).toEqual(mockMap);
      expect(getManyDetailsSpy).toHaveBeenCalledWith({ userIds });
    });

    it('should return empty map for empty array', async () => {
      const getManyDetailsSpy = vi.spyOn(UserApplication, 'getManyDetails').mockResolvedValue(new Map());

      const result = await UserController.getManyDetails({ userIds: [] });

      expect(result.size).toBe(0);
      expect(getManyDetailsSpy).toHaveBeenCalledWith({ userIds: [] });
    });
  });

  describe('getCounts', () => {
    it('should delegate to UserApplication.getCounts', async () => {
      const userId = 'test-user-id' as Pubky;
      const mockUserCounts: NexusUserCounts = {
        posts: 10,
        replies: 5,
        followers: 20,
        following: 15,
        friends: 8,
        tagged: 3,
        tags: 2,
        unique_tags: 1,
        bookmarks: 7,
      };

      const mockCachedCounts = { id: userId, ...mockUserCounts } as UserCountsModel;

      const countsSpy = vi.spyOn(UserApplication, 'getCounts').mockResolvedValue(mockCachedCounts);

      const result = await UserController.getCounts({ userId });

      expect(result).toEqual(mockCachedCounts);
      expect(countsSpy).toHaveBeenCalledWith({ userId });
    });

    it('should return null when user counts not found', async () => {
      const userId = 'non-existent-user';

      vi.spyOn(UserApplication, 'getCounts').mockResolvedValue(null);

      const result = await UserController.getCounts({ userId });

      expect(result).toBeNull();
    });

    it('should propagate errors from application layer', async () => {
      const userId = 'test-user-id';

      vi.spyOn(UserApplication, 'getCounts').mockRejectedValue(new Error('Database error'));

      await expect(UserController.getCounts({ userId })).rejects.toThrow('Database error');
    });
  });

  describe('getOrFetchCounts', () => {
    it('should delegate to UserApplication.getOrFetchCounts', async () => {
      const userId = 'test-user-id';
      const mockUserCounts: NexusUserCounts = {
        posts: 10,
        replies: 5,
        followers: 20,
        following: 15,
        friends: 8,
        tagged: 3,
        tags: 2,
        unique_tags: 1,
        bookmarks: 7,
      };

      const countsSpy = vi.spyOn(UserApplication, 'getOrFetchCounts').mockResolvedValue(mockUserCounts);

      const result = await UserController.getOrFetchCounts({ userId });

      expect(result).toEqual(mockUserCounts);
      expect(countsSpy).toHaveBeenCalledWith({ userId });
    });

    it('should return null when user counts not found', async () => {
      const userId = 'non-existent-user';

      vi.spyOn(UserApplication, 'getOrFetchCounts').mockResolvedValue(null);

      const result = await UserController.getOrFetchCounts({ userId });

      expect(result).toBeNull();
    });

    it('should propagate errors from application layer', async () => {
      const userId = 'test-user-id';

      vi.spyOn(UserApplication, 'getOrFetchCounts').mockRejectedValue(new Error('Database error'));

      await expect(UserController.getOrFetchCounts({ userId })).rejects.toThrow('Database error');
    });
  });

  describe('fetchDetails', () => {
    it('should delegate to UserApplication.fetchDetails', async () => {
      const userId = 'test-user-id';
      const mockUserDetails: NexusUserDetails = {
        id: userId,
        name: 'Test User',
        bio: 'Test bio',
        image: null,
        links: [],
        status: '',
        indexed_at: Date.now(),
      };

      const spy = vi.spyOn(UserApplication, 'fetchDetails').mockResolvedValue(mockUserDetails);

      const result = await UserController.fetchDetails({ userId });

      expect(result).toEqual(mockUserDetails);
      expect(spy).toHaveBeenCalledWith({ userId });
    });

    it('should return null when user not found', async () => {
      const userId = 'non-existent-user';

      vi.spyOn(UserApplication, 'fetchDetails').mockResolvedValue(null);

      const result = await UserController.fetchDetails({ userId });

      expect(result).toBeNull();
    });

    it('should propagate errors from application layer', async () => {
      const userId = 'test-user-id';

      vi.spyOn(UserApplication, 'fetchDetails').mockRejectedValue(new Error('Network error'));

      await expect(UserController.fetchDetails({ userId })).rejects.toThrow('Network error');
    });
  });

  describe('fetch', () => {
    it('should delegate to UserApplication.fetch', async () => {
      const userId = 'test-user-id';
      const mockUserDetails: NexusUserDetails = {
        id: userId,
        name: 'Test User',
        bio: 'Test bio',
        image: null,
        links: [],
        status: '',
        indexed_at: Date.now(),
      };

      const spy = vi.spyOn(UserApplication, 'fetch').mockResolvedValue(mockUserDetails);

      const result = await UserController.fetch({ userId });

      expect(result).toEqual(mockUserDetails);
      expect(spy).toHaveBeenCalledWith({ userId });
    });

    it('should return null when user not found', async () => {
      const userId = 'non-existent-user';

      vi.spyOn(UserApplication, 'fetch').mockResolvedValue(null);

      const result = await UserController.fetch({ userId });

      expect(result).toBeNull();
    });

    it('should propagate errors from application layer', async () => {
      const userId = 'test-user-id';

      vi.spyOn(UserApplication, 'fetch').mockRejectedValue(new Error('Network error'));

      await expect(UserController.fetch({ userId })).rejects.toThrow('Network error');
    });
  });

  describe('fetchCounts', () => {
    it('should delegate to UserApplication.fetchCounts', async () => {
      const userId = 'test-user-id';
      const mockUserCounts: NexusUserCounts = {
        posts: 10,
        replies: 5,
        followers: 20,
        following: 15,
        friends: 8,
        tagged: 3,
        tags: 2,
        unique_tags: 1,
        bookmarks: 7,
      };

      const spy = vi.spyOn(UserApplication, 'fetchCounts').mockResolvedValue(mockUserCounts);

      const result = await UserController.fetchCounts({ userId });

      expect(result).toEqual(mockUserCounts);
      expect(spy).toHaveBeenCalledWith({ userId });
    });

    it('should return null when counts not found', async () => {
      const userId = 'non-existent-user';

      vi.spyOn(UserApplication, 'fetchCounts').mockResolvedValue(null);

      const result = await UserController.fetchCounts({ userId });

      expect(result).toBeNull();
    });

    it('should propagate errors from application layer', async () => {
      const userId = 'test-user-id';

      vi.spyOn(UserApplication, 'fetchCounts').mockRejectedValue(new Error('Network error'));

      await expect(UserController.fetchCounts({ userId })).rejects.toThrow('Network error');
    });
  });

  describe('getManyCounts', () => {
    it('should delegate to UserApplication.getManyCounts', async () => {
      const userIds = ['user1', 'user2'] as Pubky[];
      const mockMap = new Map<Pubky, NexusUserCounts>([
        [
          'user1' as Pubky,
          {
            posts: 10,
            replies: 0,
            followers: 5,
            following: 0,
            friends: 0,
            tagged: 0,
            tags: 0,
            unique_tags: 0,
            bookmarks: 0,
          },
        ],
        [
          'user2' as Pubky,
          {
            posts: 20,
            replies: 0,
            followers: 15,
            following: 0,
            friends: 0,
            tagged: 0,
            tags: 0,
            unique_tags: 0,
            bookmarks: 0,
          },
        ],
      ]);

      const getManyCountsSpy = vi.spyOn(UserApplication, 'getManyCounts').mockResolvedValue(mockMap);

      const result = await UserController.getManyCounts({ userIds });

      expect(result).toEqual(mockMap);
      expect(getManyCountsSpy).toHaveBeenCalledWith({ userIds });
    });

    it('should return empty map for empty array', async () => {
      const getManyCountsSpy = vi.spyOn(UserApplication, 'getManyCounts').mockResolvedValue(new Map());

      const result = await UserController.getManyCounts({ userIds: [] });

      expect(result.size).toBe(0);
      expect(getManyCountsSpy).toHaveBeenCalledWith({ userIds: [] });
    });
  });

  describe('follow', () => {
    it('should normalize follow request and delegate to UserApplication.commitFollow (PUT)', async () => {
      const follower = TEST_PUBKY.USER_1;
      const followee = TEST_PUBKY.USER_2;

      const mockFollowJson = { foo: 'bar' } as Record<string, unknown>;
      const mockToJson = vi.fn(() => mockFollowJson);
      const mockMeta = { url: 'https://example.com/follow' } as { url: string };

      const toSpy = vi.spyOn(FollowNormalizer, 'to').mockReturnValue(
        asOpaque<FollowResult>({
          meta: mockMeta,
          follow: { toJson: mockToJson },
        }),
      );

      // Mock useHomeStore to return null for activeStreamId (not on /home route)
      mockUseHomeStoreGetState.mockReturnValue(createMockHomeState());
      const followSpy = vi.spyOn(UserApplication, 'commitFollow').mockResolvedValue(undefined);

      await UserController.commitFollow(HttpMethod.PUT, { follower, followee });

      expect(toSpy).toHaveBeenCalledWith({ follower, followee });
      expect(mockToJson).toHaveBeenCalled();
      expect(followSpy).toHaveBeenCalledWith({
        eventType: HttpMethod.PUT,
        followUrl: mockMeta.url,
        followJson: mockFollowJson,
        follower,
        followee,
        activeStreamId: null,
      });
    });

    it('should support DELETE action and delegate correctly', async () => {
      const follower = TEST_PUBKY.USER_1;
      const followee = TEST_PUBKY.USER_2;

      const mockFollowJson = { baz: 1 } as Record<string, unknown>;
      const mockToJson = vi.fn(() => mockFollowJson);
      const mockMeta = { url: 'https://example.com/unfollow' } as { url: string };

      vi.spyOn(FollowNormalizer, 'to').mockReturnValue(
        asOpaque<FollowResult>({
          meta: mockMeta,
          follow: { toJson: mockToJson },
        }),
      );

      // Mock useHomeStore to return null for activeStreamId (not on /home route)
      mockUseHomeStoreGetState.mockReturnValue(createMockHomeState());
      const followSpy = vi.spyOn(UserApplication, 'commitFollow').mockResolvedValue(undefined);

      await UserController.commitFollow(HttpMethod.DELETE, { follower, followee });

      expect(followSpy).toHaveBeenCalledWith({
        eventType: HttpMethod.DELETE,
        followUrl: mockMeta.url,
        followJson: mockFollowJson,
        follower,
        followee,
        activeStreamId: null,
      });
    });

    it('should bubble when FollowNormalizer.to fails and not delegate', async () => {
      const follower = TEST_PUBKY.USER_1;
      const followee = TEST_PUBKY.USER_2;

      vi.spyOn(FollowNormalizer, 'to').mockImplementation(() => {
        throw new Error('normalize-fail');
      });
      const followSpy = vi.spyOn(UserApplication, 'commitFollow').mockResolvedValue(undefined);

      await expect(UserController.commitFollow(HttpMethod.PUT, { follower, followee })).rejects.toThrow(
        'normalize-fail',
      );

      expect(followSpy).not.toHaveBeenCalled();
    });

    it('should bubble when UserApplication.follow fails', async () => {
      const follower = TEST_PUBKY.USER_1;
      const followee = TEST_PUBKY.USER_2;

      vi.spyOn(FollowNormalizer, 'to').mockReturnValue(
        asOpaque<FollowResult>({
          meta: { url: 'https://example.com/follow' },
          follow: { toJson: () => ({}) },
        }),
      );

      // Mock useHomeStore to return null for activeStreamId (not on /home route)
      mockUseHomeStoreGetState.mockReturnValue(createMockHomeState());
      vi.spyOn(UserApplication, 'commitFollow').mockRejectedValue(new Error('delegate-fail'));

      await expect(UserController.commitFollow(HttpMethod.PUT, { follower, followee })).rejects.toThrow(
        'delegate-fail',
      );
    });

    it('should pass activeStreamId when on /home route', async () => {
      const follower = TEST_PUBKY.USER_1;
      const followee = TEST_PUBKY.USER_2;
      const mockStreamId = 'home:all:all' as PostStreamTypes;

      const mockFollowJson = { foo: 'bar' } as Record<string, unknown>;
      const mockToJson = vi.fn(() => mockFollowJson);
      const mockMeta = { url: 'https://example.com/follow' } as { url: string };

      vi.spyOn(FollowNormalizer, 'to').mockReturnValue(
        asOpaque<FollowResult>({
          meta: mockMeta,
          follow: { toJson: mockToJson },
        }),
      );

      // Mock window.location.pathname to be /home
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home' },
        writable: true,
      });
      // Mock useHomeStore and getStreamId to return the mock stream ID
      mockUseHomeStoreGetState.mockReturnValue(createMockHomeState());
      mockGetStreamId.mockReturnValue(mockStreamId);
      const followSpy = vi.spyOn(UserApplication, 'commitFollow').mockResolvedValue(undefined);

      await UserController.commitFollow(HttpMethod.PUT, { follower, followee });

      expect(followSpy).toHaveBeenCalledWith({
        eventType: HttpMethod.PUT,
        followUrl: mockMeta.url,
        followJson: mockFollowJson,
        follower,
        followee,
        activeStreamId: mockStreamId,
      });
    });
  });

  describe('tags', () => {
    it('should delegate to UserApplication with correct params', async () => {
      const userId = 'pubky-user';
      const mockTags = [
        { label: 'developer', taggers: [] as Pubky[], taggers_count: 0, relationship: false },
      ] as NexusTag[];

      const tagsSpy = vi.spyOn(UserApplication, 'fetchTags').mockResolvedValue(mockTags);

      const result = await UserController.fetchTags({
        user_id: userId,
        skip_tags: 5,
        limit_tags: 20,
      });

      expect(result).toEqual(mockTags);
      expect(tagsSpy).toHaveBeenCalledWith({
        user_id: userId,
        skip_tags: 5,
        limit_tags: 20,
      });
    });

    it('should propagate errors from application layer', async () => {
      const userId = 'pubky-user';

      vi.spyOn(UserApplication, 'fetchTags').mockRejectedValue(new Error('Application error'));

      await expect(
        UserController.fetchTags({
          user_id: userId,
          skip_tags: 0,
          limit_tags: 10,
        }),
      ).rejects.toThrow('Application error');
    });
  });

  describe('taggers', () => {
    it('should delegate to UserApplication with correct params', async () => {
      const userId = 'pubky-user';
      const mockTaggers: NexusTaggers[] = [];

      const taggersSpy = vi.spyOn(UserApplication, 'fetchTaggers').mockResolvedValue(mockTaggers);

      const result = await UserController.fetchTaggers({
        user_id: userId,
        label: 'rust & wasm',
        skip: 10,
        limit: 5,
      });

      expect(result).toEqual(mockTaggers);
      expect(taggersSpy).toHaveBeenCalledWith({
        user_id: userId,
        label: 'rust & wasm',
        skip: 10,
        limit: 5,
      });
    });

    it('should propagate errors from application layer', async () => {
      const userId = 'pubky-user';

      vi.spyOn(UserApplication, 'fetchTaggers').mockRejectedValue(new Error('Application error'));

      await expect(
        UserController.fetchTaggers({
          user_id: userId,
          label: 'developer',
          skip: 0,
          limit: 10,
        }),
      ).rejects.toThrow('Application error');
    });
  });
});
