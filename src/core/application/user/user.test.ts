import { describe, it, expect, vi, beforeEach } from 'vitest';
import { asInvalid } from '@/test-utils';
import { UserApplication } from './user';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import type { UserCountsModel } from '@/models/user/counts/userCounts';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFollowService } from '@/services/local/follow/follow';
import { LocalProfileService } from '@/services/local/profile/profile';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalUserService } from '@/services/local/user/user';
import type {
  NexusTag,
  NexusTaggers,
  NexusUser,
  NexusUserCounts,
  NexusUserDetails,
} from '@/services/nexus/nexus.types';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { NexusUserService } from '@/services/nexus/user/user';
describe('UserApplication.commitFollow', () => {
  const follower = 'pubky_follower' as Pubky;
  const followee = 'pubky_followee' as Pubky;
  const followUrl = 'pubky://follower/pub/pubky.app/follow';
  const followJson = { foo: 'bar' } as Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update local state on PUT and call homeserver', async () => {
    const createSpy = vi.spyOn(LocalFollowService, 'create').mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(LocalFollowService, 'delete').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await UserApplication.commitFollow({
      eventType: HttpMethod.PUT,
      followUrl,
      followJson,
      follower,
      followee,
      activeStreamId: undefined,
    });

    expect(createSpy).toHaveBeenCalledWith({ follower, followee, activeStreamId: undefined });
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.PUT, url: followUrl, bodyJson: followJson });
  });

  it('should update local state on DELETE and call homeserver', async () => {
    const createSpy = vi.spyOn(LocalFollowService, 'create').mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(LocalFollowService, 'delete').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await UserApplication.commitFollow({
      eventType: HttpMethod.DELETE,
      followUrl,
      followJson,
      follower,
      followee,
      activeStreamId: undefined,
    });

    expect(deleteSpy).toHaveBeenCalledWith({ follower, followee, activeStreamId: undefined });
    expect(createSpy).not.toHaveBeenCalled();
    expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: followUrl, bodyJson: followJson });
  });

  it('should not update local state for non-mutate methods but still call homeserver', async () => {
    const createSpy = vi.spyOn(LocalFollowService, 'create').mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(LocalFollowService, 'delete').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await UserApplication.commitFollow({
      eventType: HttpMethod.GET,
      followUrl,
      followJson,
      follower,
      followee,
      activeStreamId: undefined,
    });

    expect(createSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: followUrl, bodyJson: followJson });
  });

  it('should propagate error when local create fails on PUT and not call homeserver', async () => {
    const createSpy = vi.spyOn(LocalFollowService, 'create').mockRejectedValue(new Error('local-fail'));
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await expect(
      UserApplication.commitFollow({
        eventType: HttpMethod.PUT,
        followUrl,
        followJson,
        follower,
        followee,
        activeStreamId: undefined,
      }),
    ).rejects.toThrow('local-fail');

    expect(createSpy).toHaveBeenCalledOnce();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('should propagate error when local delete fails on DELETE and not call homeserver', async () => {
    const deleteSpy = vi.spyOn(LocalFollowService, 'delete').mockRejectedValue(new Error('local-delete-fail'));
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await expect(
      UserApplication.commitFollow({
        eventType: HttpMethod.DELETE,
        followUrl,
        followJson,
        follower,
        followee,
        activeStreamId: undefined,
      }),
    ).rejects.toThrow('local-delete-fail');

    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('should propagate error when homeserver request fails', async () => {
    vi.spyOn(LocalFollowService, 'create').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver-fail'));

    await expect(
      UserApplication.commitFollow({
        eventType: HttpMethod.PUT,
        followUrl,
        followJson,
        follower,
        followee,
        activeStreamId: undefined,
      }),
    ).rejects.toThrow('homeserver-fail');

    expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.PUT, url: followUrl, bodyJson: followJson });
  });
});

describe('UserApplication.fetchTags', () => {
  const userId = 'pubky_user' as Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate to NexusUserService with correct params', async () => {
    const mockTags = [
      { label: 'developer', taggers: [] as Pubky[], taggers_count: 0, relationship: false },
    ] as NexusTag[];

    const nexusSpy = vi.spyOn(NexusUserService, 'tags').mockResolvedValue(mockTags);

    const result = await UserApplication.fetchTags({
      user_id: userId,
      skip_tags: 5,
      limit_tags: 20,
    });

    expect(result).toEqual(mockTags);
    expect(nexusSpy).toHaveBeenCalledWith({
      user_id: userId,
      skip_tags: 5,
      limit_tags: 20,
    });
  });

  it('should propagate errors from service layer', async () => {
    vi.spyOn(NexusUserService, 'tags').mockRejectedValue(new Error('Service unavailable'));

    await expect(
      UserApplication.fetchTags({
        user_id: userId,
        skip_tags: 0,
        limit_tags: 10,
      }),
    ).rejects.toThrow('Service unavailable');
  });
});

describe('UserApplication.fetchTaggers', () => {
  const userId = 'pubky_user' as Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate to NexusUserService with correct params', async () => {
    const mockTaggers = [] as NexusTaggers[];
    const nexusSpy = vi.spyOn(NexusUserService, 'taggers').mockResolvedValue(mockTaggers);

    const result = await UserApplication.fetchTaggers({
      user_id: userId,
      label: 'rust & wasm',
      skip: 10,
      limit: 5,
    });

    expect(result).toEqual(mockTaggers);
    expect(nexusSpy).toHaveBeenCalledWith({
      user_id: userId,
      label: 'rust & wasm',
      skip: 10,
      limit: 5,
    });
  });

  it('should propagate errors from service layer', async () => {
    vi.spyOn(NexusUserService, 'taggers').mockRejectedValue(new Error('Network error'));

    await expect(
      UserApplication.fetchTaggers({
        user_id: userId,
        label: 'developer',
        skip: 0,
        limit: 10,
      }),
    ).rejects.toThrow('Network error');
  });
});

describe('UserApplication.getOrFetchDetails', () => {
  const userId = 'pubky_user' as Pubky;
  const mockUserDetails: NexusUserDetails = {
    id: userId,
    name: 'Test User',
    bio: 'Test bio',
    image: 'https://example.com/avatar.jpg',
    indexed_at: 1234567890,
    links: [{ title: 'GitHub', url: 'https://github.com/user' }],
    status: 'online',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user details from local cache when available (local-first)', async () => {
    const localSpy = vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(mockUserDetails);
    const nexusSpy = vi.spyOn(NexusUserService, 'details').mockResolvedValue(mockUserDetails);
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertDetails').mockResolvedValue(undefined);

    const result = await UserApplication.getOrFetchDetails({ userId });

    expect(result).toEqual(mockUserDetails);
    expect(localSpy).toHaveBeenCalledWith({ userId });
    expect(nexusSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('should fetch from Nexus and cache locally when not in local cache', async () => {
    const localSpy = vi
      .spyOn(LocalUserService, 'readDetails')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockUserDetails);
    const nexusSpy = vi.spyOn(NexusUserService, 'details').mockResolvedValue(mockUserDetails);
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertDetails').mockResolvedValue(undefined);

    const result = await UserApplication.getOrFetchDetails({ userId });

    expect(result).toEqual(mockUserDetails);
    expect(localSpy).toHaveBeenCalledTimes(2);
    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId });
    expect(upsertSpy).toHaveBeenCalledWith(mockUserDetails);
  });

  it('should return null when user not found in local cache or Nexus', async () => {
    const localSpy = vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(null);
    const nexusSpy = vi.spyOn(NexusUserService, 'details').mockResolvedValue(asInvalid<NexusUserDetails>(undefined));
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertDetails').mockResolvedValue(undefined);

    const result = await UserApplication.getOrFetchDetails({ userId });

    expect(result).toBeNull();
    expect(localSpy).toHaveBeenCalledTimes(2);
    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId });
    expect(upsertSpy).toHaveBeenCalledWith(undefined);
  });

  it('should propagate errors from local service', async () => {
    vi.spyOn(LocalUserService, 'readDetails').mockRejectedValue(new Error('Local database error'));
    const nexusSpy = vi.spyOn(NexusUserService, 'details').mockResolvedValue(mockUserDetails);

    await expect(UserApplication.getOrFetchDetails({ userId })).rejects.toThrow('Local database error');

    expect(nexusSpy).not.toHaveBeenCalled();
  });

  it('should propagate errors from Nexus service when local cache is empty', async () => {
    vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(null);
    vi.spyOn(NexusUserService, 'details').mockRejectedValue(new Error('Network error'));
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertDetails').mockResolvedValue(undefined);

    await expect(UserApplication.getOrFetchDetails({ userId })).rejects.toThrow('Network error');

    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('should propagate errors from upsert when caching Nexus data', async () => {
    vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(null);
    vi.spyOn(NexusUserService, 'details').mockResolvedValue(mockUserDetails);
    vi.spyOn(LocalProfileService, 'upsertDetails').mockRejectedValue(new Error('Cache write error'));

    await expect(UserApplication.getOrFetchDetails({ userId })).rejects.toThrow('Cache write error');
  });
});

describe('UserApplication.fetchDetails', () => {
  const userId = 'pubky_user' as Pubky;
  const mockUserDetails: NexusUserDetails = {
    id: userId,
    name: 'Test User',
    bio: 'Test bio',
    image: 'https://example.com/avatar.jpg',
    indexed_at: 1234567890,
    links: [{ title: 'GitHub', url: 'https://github.com/user' }],
    status: 'online',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch from Nexus, persist, and re-read from local', async () => {
    const nexusSpy = vi.spyOn(NexusUserService, 'details').mockResolvedValue(mockUserDetails);
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertDetails').mockResolvedValue(undefined);
    const localSpy = vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(mockUserDetails);

    const result = await UserApplication.fetchDetails({ userId });

    expect(result).toEqual(mockUserDetails);
    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId });
    expect(upsertSpy).toHaveBeenCalledWith(mockUserDetails);
    expect(localSpy).toHaveBeenCalledTimes(1);
    expect(localSpy).toHaveBeenCalledWith({ userId });
  });

  it('should propagate errors from Nexus service', async () => {
    vi.spyOn(NexusUserService, 'details').mockRejectedValue(new Error('Network error'));
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertDetails').mockResolvedValue(undefined);

    await expect(UserApplication.fetchDetails({ userId })).rejects.toThrow('Network error');

    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('should propagate errors from upsert', async () => {
    vi.spyOn(NexusUserService, 'details').mockResolvedValue(mockUserDetails);
    vi.spyOn(LocalProfileService, 'upsertDetails').mockRejectedValue(new Error('Cache write error'));

    await expect(UserApplication.fetchDetails({ userId })).rejects.toThrow('Cache write error');
  });
});

describe('UserApplication.getCounts', () => {
  const userId = 'pubky_user' as Pubky;
  const mockUserCounts: NexusUserCounts = {
    posts: 42,
    replies: 15,
    followers: 100,
    following: 50,
    friends: 25,
    tagged: 10,
    tags: 8,
    unique_tags: 5,
    bookmarks: 30,
  };

  const mockCachedCounts = { id: userId, ...mockUserCounts } as UserCountsModel;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user counts from local cache', async () => {
    const localSpy = vi.spyOn(LocalUserService, 'readCounts').mockResolvedValue(mockCachedCounts);

    const result = await UserApplication.getCounts({ userId });

    expect(result).toEqual(mockCachedCounts);
    expect(localSpy).toHaveBeenCalledWith({ userId });
  });

  it('should return null when user counts not found in local cache (local-only per ADR 0001)', async () => {
    const localSpy = vi.spyOn(LocalUserService, 'readCounts').mockResolvedValue(null);

    const result = await UserApplication.getCounts({ userId });

    expect(result).toBeNull();
    expect(localSpy).toHaveBeenCalledWith({ userId });
  });

  it('should propagate errors from local service', async () => {
    vi.spyOn(LocalUserService, 'readCounts').mockRejectedValue(new Error('Local database error'));

    await expect(UserApplication.getCounts({ userId })).rejects.toThrow('Local database error');
  });
});

describe('UserApplication.getOrFetchCounts', () => {
  const userId = 'pubky_user' as Pubky;
  const mockUserCounts: NexusUserCounts = {
    posts: 42,
    replies: 15,
    followers: 100,
    following: 50,
    friends: 25,
    bookmarks: 10,
    tagged: 5,
    tags: 3,
    unique_tags: 2,
  };

  const mockCachedCounts = { id: userId, ...mockUserCounts } as UserCountsModel;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user counts from local cache when available (local-first)', async () => {
    const localSpy = vi.spyOn(LocalUserService, 'readCounts').mockResolvedValue(mockCachedCounts);
    const nexusSpy = vi.spyOn(NexusUserService, 'counts');

    const result = await UserApplication.getOrFetchCounts({ userId });

    expect(result).toEqual(mockCachedCounts);
    expect(localSpy).toHaveBeenCalledWith({ userId });
    expect(nexusSpy).not.toHaveBeenCalled();
  });

  it('should fetch from Nexus and cache locally when not in local cache', async () => {
    const localSpy = vi.spyOn(LocalUserService, 'readCounts').mockResolvedValue(null);
    const nexusSpy = vi.spyOn(NexusUserService, 'counts').mockResolvedValue(mockUserCounts);
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertCounts').mockResolvedValue(undefined);

    const result = await UserApplication.getOrFetchCounts({ userId });

    expect(result).toEqual(mockUserCounts);
    expect(localSpy).toHaveBeenCalledWith({ userId });
    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId });
    expect(upsertSpy).toHaveBeenCalledWith(userId, mockUserCounts);
  });

  it('should return null when Nexus service fails (e.g., user not indexed)', async () => {
    vi.spyOn(LocalUserService, 'readCounts').mockResolvedValue(null);
    vi.spyOn(NexusUserService, 'counts').mockRejectedValue(new Error('Bad Request'));
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertCounts');

    const result = await UserApplication.getOrFetchCounts({ userId });

    expect(result).toBeNull();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('should propagate errors from local service', async () => {
    vi.spyOn(LocalUserService, 'readCounts').mockRejectedValue(new Error('Local database error'));

    await expect(UserApplication.getOrFetchCounts({ userId })).rejects.toThrow('Local database error');
  });
});

describe('UserApplication.fetchCounts', () => {
  const userId = 'pubky_user' as Pubky;
  const mockUserCounts: NexusUserCounts = {
    posts: 42,
    replies: 15,
    followers: 100,
    following: 50,
    friends: 25,
    bookmarks: 10,
    tagged: 5,
    tags: 3,
    unique_tags: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch counts from Nexus and persist', async () => {
    const nexusSpy = vi.spyOn(NexusUserService, 'counts').mockResolvedValue(mockUserCounts);
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertCounts').mockResolvedValue(undefined);
    const readCountsSpy = vi.spyOn(LocalUserService, 'readCounts');

    const result = await UserApplication.fetchCounts({ userId });

    expect(result).toEqual(mockUserCounts);
    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId });
    expect(upsertSpy).toHaveBeenCalledWith(userId, mockUserCounts);
    expect(readCountsSpy).not.toHaveBeenCalled();
  });

  it('should return null when Nexus service fails', async () => {
    vi.spyOn(NexusUserService, 'counts').mockRejectedValue(new Error('Bad Request'));
    const upsertSpy = vi.spyOn(LocalProfileService, 'upsertCounts');

    const result = await UserApplication.fetchCounts({ userId });

    expect(result).toBeNull();
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe('UserApplication.getOrFetch', () => {
  const userId = 'pubky_user' as Pubky;
  const mockUserDetails: NexusUserDetails = {
    id: userId,
    name: 'Test User',
    bio: 'Test bio',
    image: 'https://example.com/avatar.jpg',
    indexed_at: 1234567890,
    links: [{ title: 'GitHub', url: 'https://github.com/user' }],
    status: 'online',
  };
  const mockNexusUser: NexusUser = {
    details: mockUserDetails,
    counts: {
      posts: 42,
      replies: 15,
      followers: 100,
      following: 50,
      friends: 25,
      tagged: 10,
      tags: 8,
      unique_tags: 5,
      bookmarks: 30,
    },
    tags: [{ label: 'developer', taggers: [], taggers_count: 0, relationship: false }],
    relationship: { following: false, followed_by: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user details from local cache when available (local-first)', async () => {
    const localSpy = vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(mockUserDetails);
    const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds');
    const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

    const result = await UserApplication.getOrFetch({ userId });

    expect(result).toEqual(mockUserDetails);
    expect(localSpy).toHaveBeenCalledWith({ userId });
    expect(fetchByIdsSpy).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it('should fetch from Nexus batch endpoint and persist when not in local cache', async () => {
    const localSpy = vi
      .spyOn(LocalUserService, 'readDetails')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockUserDetails);
    const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([mockNexusUser]);
    const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([userId]);

    const result = await UserApplication.getOrFetch({ userId });

    expect(result).toEqual(mockUserDetails);
    expect(localSpy).toHaveBeenCalledTimes(2);
    expect(fetchByIdsSpy).toHaveBeenCalledWith({ user_ids: [userId] });
    expect(persistSpy).toHaveBeenCalledWith([mockNexusUser]);
  });

  it('should return null when Nexus returns empty array (user not indexed)', async () => {
    vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(null);
    const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

    const result = await UserApplication.getOrFetch({ userId });

    expect(result).toBeNull();
    expect(fetchByIdsSpy).toHaveBeenCalledWith({ user_ids: [userId] });
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it('should return null when Nexus fetch fails (graceful degradation)', async () => {
    vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(null);
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockRejectedValue(new Error('Network error'));
    const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

    const result = await UserApplication.getOrFetch({ userId });

    expect(result).toBeNull();
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it('should propagate errors from local read (not caught)', async () => {
    vi.spyOn(LocalUserService, 'readDetails').mockRejectedValue(new Error('IndexedDB error'));
    const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds');

    await expect(UserApplication.getOrFetch({ userId })).rejects.toThrow('IndexedDB error');

    expect(fetchByIdsSpy).not.toHaveBeenCalled();
  });

  it('should return null when persist fails (caught by try/catch)', async () => {
    vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(null);
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([mockNexusUser]);
    vi.spyOn(LocalStreamUsersService, 'persistUsers').mockRejectedValue(new Error('Write failed'));

    const result = await UserApplication.getOrFetch({ userId });

    expect(result).toBeNull();
  });

  it('should re-read from local cache after successful persist', async () => {
    const localSpy = vi
      .spyOn(LocalUserService, 'readDetails')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockUserDetails);
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([mockNexusUser]);
    vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([userId]);

    await UserApplication.getOrFetch({ userId });

    // First call: check local cache (miss). Second call: re-read after persist.
    expect(localSpy).toHaveBeenNthCalledWith(1, { userId });
    expect(localSpy).toHaveBeenNthCalledWith(2, { userId });
  });
});

describe('UserApplication.fetch', () => {
  const userId = 'pubky_user' as Pubky;
  const mockUserDetails: NexusUserDetails = {
    id: userId,
    name: 'Test User',
    bio: 'Test bio',
    image: 'https://example.com/avatar.jpg',
    indexed_at: 1234567890,
    links: [{ title: 'GitHub', url: 'https://github.com/user' }],
    status: 'online',
  };
  const mockNexusUser: NexusUser = {
    details: mockUserDetails,
    counts: {
      posts: 42,
      replies: 15,
      followers: 100,
      following: 50,
      friends: 25,
      tagged: 10,
      tags: 8,
      unique_tags: 5,
      bookmarks: 30,
    },
    tags: [{ label: 'developer', taggers: [], taggers_count: 0, relationship: false }],
    relationship: { following: false, followed_by: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch from Nexus batch endpoint and persist', async () => {
    const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([mockNexusUser]);
    const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([userId]);
    const localSpy = vi.spyOn(LocalUserService, 'readDetails').mockResolvedValue(mockUserDetails);

    const result = await UserApplication.fetch({ userId });

    expect(result).toEqual(mockUserDetails);
    expect(fetchByIdsSpy).toHaveBeenCalledWith({ user_ids: [userId] });
    expect(persistSpy).toHaveBeenCalledWith([mockNexusUser]);
    expect(localSpy).toHaveBeenCalledTimes(1);
    expect(localSpy).toHaveBeenCalledWith({ userId });
  });

  it('should return null when Nexus returns empty array', async () => {
    const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

    const result = await UserApplication.fetch({ userId });

    expect(result).toBeNull();
    expect(fetchByIdsSpy).toHaveBeenCalledWith({ user_ids: [userId] });
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it('should return null when Nexus fetch fails', async () => {
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockRejectedValue(new Error('Network error'));
    const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

    const result = await UserApplication.fetch({ userId });

    expect(result).toBeNull();
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it('should propagate errors from re-read', async () => {
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([mockNexusUser]);
    vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([userId]);
    vi.spyOn(LocalUserService, 'readDetails').mockRejectedValue(new Error('IndexedDB error'));

    await expect(UserApplication.fetch({ userId })).rejects.toThrow('IndexedDB error');
  });
});
