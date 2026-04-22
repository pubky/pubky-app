import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LastReadResult } from 'pubky-app-specs';
import { BootstrapApplication } from './bootstrap';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { asOpaque } from '@/test-utils';

// Mock pubky-app-specs to avoid WebAssembly issues
vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
}));

const TEST_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const MOCK_LAST_READ_URL = 'http://example.com/last-read';
const MOCK_LAST_READ = 1234567890;

const emptyBootstrap = (): Core.NexusBootstrapResponse => ({
  users: [],
  posts: [],
  files: [],
  ids: { stream: [], influencers: [], recommended: [], hot_tags: [], muted: [] },
  indexed: true,
  notifications: [],
});

const createMockBootstrapData = (): Core.NexusBootstrapResponse => ({
  users: [
    {
      details: {
        id: 'user-1',
        name: 'Test User',
        bio: 'Test bio',
        image: null,
        links: null,
        status: null,
        indexed_at: Date.now(),
      },
      counts: {
        followers: 10,
        following: 5,
        posts: 20,
        tagged: 0,
        tags: 0,
        unique_tags: 0,
        replies: 0,
        friends: 0,
        bookmarks: 0,
      },
      relationship: { following: false, followed_by: false },
      tags: [],
    },
  ],
  posts: [
    {
      details: {
        id: 'post-1',
        content: 'Test post content',
        kind: 'short',
        attachments: [],
        uri: 'pubky://user-1/pub/pubky.app/posts/post-1',
        indexed_at: Date.now(),
        author: 'user-1',
      },
      counts: { replies: 0, reposts: 0, tags: 0, unique_tags: 0 },
      relationships: { reposted: null, replied: null, mentioned: [] },
      bookmark: null,
      tags: [],
    },
  ],
  files: [],
  ids: {
    stream: ['post-1'],
    influencers: ['user-1'],
    recommended: ['user-2'],
    hot_tags: [{ label: 'technology', taggers_id: ['user-1'], tagged_count: 1, taggers_count: 1 }],
    muted: [],
  },
  indexed: true,
  notifications: [],
});

const createMockNotification = (): Core.NexusNotification => ({
  timestamp: Date.now(),
  body: { type: 'like', user_id: 'user-2', post_id: 'post-1' },
});

const createFlatNotification = (timestamp: number): Core.FlatNotification =>
  ({
    type: Core.NotificationType.Follow,
    timestamp,
    followed_by: `user-${timestamp}`,
  }) as Core.FlatNotification;

const MOCK_LOCAL_SETTINGS: Core.SettingsState = {
  notifications: Core.defaultNotificationPreferences,
  privacy: Core.defaultPrivacyPreferences,
  muted: [],
  language: 'en',
  updatedAt: 0,
  version: 1,
};

const getBootstrapParams = (pubky: string): Core.TBootstrapParams & { localSettings: Core.SettingsState } => {
  const {
    meta: { url },
  } = Core.NotificationNormalizer.to(pubky);
  return { pubky, lastReadUrl: url, localSettings: MOCK_LOCAL_SETTINGS };
};

type MockConfig = {
  bootstrapData?: Core.NexusBootstrapResponse | null;
  bootstrapError?: Error;
  homeserverError?: Error;
  unreadCount?: number;
  persistUsersError?: Error;
  persistPostsError?: Error;
  upsertPostsError?: Error;
  upsertInfluencersError?: Error;
  upsertTagsError?: Error;
  persistFilesError?: Error;
  bulkSaveError?: Error;
  countUnreadError?: Error;
  settingsInitError?: Error;
  remoteSettings?: Core.SettingsState | null;
  mutedUsers?: Core.Pubky[];
  fetchMutedUsersError?: Error;
  fetchFeedsError?: Error;
};

type ServiceMocks = {
  nexusFetch: unknown;
  homeserverRequest: unknown;
  fetchMutedUsers: unknown;
  fetchFeeds: unknown;
  persistUsers: unknown;
  persistPosts: unknown;
  persistFiles: unknown;
  upsertPostsStream: unknown;
  upsertInfluencersStream: unknown;
  upsertHotTags: unknown;
  upsertTagsStream: unknown;
  bulkSave: unknown;
  countUnreadSince: unknown;
  initializeSettings: unknown;
};

const setupMocks = (config: MockConfig = {}): ServiceMocks => {
  const {
    bootstrapData = emptyBootstrap(),
    bootstrapError,
    homeserverError,
    unreadCount = 0,
    persistUsersError,
    persistPostsError,
    upsertPostsError,
    upsertInfluencersError,
    upsertTagsError,
    persistFilesError,
    bulkSaveError,
    countUnreadError,
    settingsInitError,
    remoteSettings = null,
    mutedUsers = [],
    fetchMutedUsersError,
    fetchFeedsError,
  } = config;

  vi.clearAllMocks();

  return {
    nexusFetch: vi
      .spyOn(Core.NexusBootstrapService, 'fetch')
      .mockImplementation(
        bootstrapError
          ? () => Promise.reject(bootstrapError)
          : () => Promise.resolve(bootstrapData as Core.NexusBootstrapResponse),
      ),
    homeserverRequest: vi
      .spyOn(Core.HomeserverService, 'request')
      .mockImplementation(
        homeserverError ? () => Promise.reject(homeserverError) : () => Promise.resolve({ timestamp: MOCK_LAST_READ }),
      ),
    fetchMutedUsers: vi
      .spyOn(Core.MuteApplication, 'fetchMutedUsers')
      .mockImplementation(
        fetchMutedUsersError ? () => Promise.reject(fetchMutedUsersError) : () => Promise.resolve(mutedUsers),
      ),
    fetchFeeds: vi
      .spyOn(Core.FeedApplication, 'fetchFeeds')
      .mockImplementation(fetchFeedsError ? () => Promise.reject(fetchFeedsError) : () => Promise.resolve([])),
    persistUsers: vi
      .spyOn(Core.LocalStreamUsersService, 'persistUsers')
      .mockImplementation(persistUsersError ? () => Promise.reject(persistUsersError) : () => Promise.resolve([])),
    persistPosts: vi
      .spyOn(Core.LocalStreamPostsService, 'persistPosts')
      .mockImplementation(
        persistPostsError ? () => Promise.reject(persistPostsError) : () => Promise.resolve({ attachmentMetadata: [] }),
      ),
    persistFiles: vi
      .spyOn(Core.FileApplication, 'persistFiles')
      .mockImplementation(
        persistFilesError ? () => Promise.reject(persistFilesError) : () => Promise.resolve(undefined),
      ),
    upsertPostsStream: vi
      .spyOn(Core.LocalStreamPostsService, 'upsert')
      .mockImplementation(upsertPostsError ? () => Promise.reject(upsertPostsError) : () => Promise.resolve(undefined)),
    upsertInfluencersStream: vi
      .spyOn(Core.LocalStreamUsersService, 'upsert')
      .mockImplementation(
        upsertInfluencersError ? () => Promise.reject(upsertInfluencersError) : () => Promise.resolve(undefined),
      ),
    upsertHotTags: vi.spyOn(Core.LocalHotService, 'upsert').mockResolvedValue(undefined),
    upsertTagsStream: vi
      .spyOn(Core.LocalStreamTagsService, 'upsert')
      .mockImplementation(upsertTagsError ? () => Promise.reject(upsertTagsError) : () => Promise.resolve(undefined)),
    bulkSave: vi
      .spyOn(Core.LocalNotificationService, 'bulkSave')
      .mockImplementation(bulkSaveError ? () => Promise.reject(bulkSaveError) : () => Promise.resolve(undefined)),
    countUnreadSince: vi
      .spyOn(Core.LocalNotificationService, 'countUnreadSince')
      .mockImplementation(
        countUnreadError ? () => Promise.reject(countUnreadError) : () => Promise.resolve(unreadCount),
      ),
    initializeSettings: vi
      .spyOn(Core.SettingsApplication, 'initializeSettings')
      .mockImplementation(
        settingsInitError ? () => Promise.reject(settingsInitError) : () => Promise.resolve(remoteSettings),
      ),
  };
};

const assertCommonCalls = (mocks: ServiceMocks, bootstrapData: Core.NexusBootstrapResponse) => {
  expect(mocks.nexusFetch).toHaveBeenCalledWith(TEST_PUBKY);
  expect(mocks.homeserverRequest).toHaveBeenCalledWith({ method: Libs.HttpMethod.GET, url: MOCK_LAST_READ_URL });
  expect(mocks.fetchMutedUsers).toHaveBeenCalledWith(TEST_PUBKY);
  expect(mocks.fetchFeeds).toHaveBeenCalledWith(TEST_PUBKY);
  expect(mocks.persistUsers).toHaveBeenCalledWith(bootstrapData.users);
  expect(mocks.persistPosts).toHaveBeenCalledWith({ posts: bootstrapData.posts });
  expect(mocks.upsertPostsStream).toHaveBeenCalledWith({
    streamId: Core.PostStreamTypes.TIMELINE_ALL_ALL,
    stream: bootstrapData.ids.stream,
  });
  expect(mocks.upsertInfluencersStream).toHaveBeenCalledWith({
    streamId: Core.UserStreamTypes.TODAY_INFLUENCERS_ALL,
    stream: bootstrapData.ids.influencers,
  });
  expect(mocks.upsertInfluencersStream).toHaveBeenCalledWith({
    streamId: Core.UserStreamTypes.RECOMMENDED,
    stream: bootstrapData.ids.recommended,
  });
  expect(mocks.upsertHotTags).toHaveBeenCalledWith(
    Core.buildHotTagsId(Core.UserStreamTimeframe.TODAY, 'all'),
    bootstrapData.ids.hot_tags,
  );
  expect(mocks.upsertTagsStream).toHaveBeenCalledWith(Core.TagStreamTypes.TODAY_ALL, bootstrapData.ids.hot_tags);
  expect(mocks.persistFiles).toHaveBeenCalledWith(bootstrapData.files);
  const flatNotifications = bootstrapData.notifications.map((n) => createFlatNotification(n.timestamp));
  expect(mocks.bulkSave).toHaveBeenCalledWith({ flatNotifications });
  expect(mocks.countUnreadSince).toHaveBeenCalledWith(MOCK_LAST_READ);
};

describe('BootstrapApplication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(Core.NotificationNormalizer, 'to').mockReturnValue({
      meta: { url: MOCK_LAST_READ_URL },
    } as LastReadResult);
    vi.spyOn(Core.NotificationNormalizer, 'toFlatNotification').mockImplementation((n) =>
      createFlatNotification(n.timestamp),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('read', () => {
    it('should successfully fetch and persist bootstrap data with notifications', async () => {
      const bootstrapData = createMockBootstrapData();
      bootstrapData.notifications = [createMockNotification()];
      const mocks = setupMocks({ bootstrapData, unreadCount: 1 });

      const onProgress = vi.fn();

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY), onProgress);

      assertCommonCalls(mocks, bootstrapData);
      expect(result).toEqual({
        notification: { unread: 1, lastRead: MOCK_LAST_READ, lastPolledTimestamp: expect.any(Number) },
        remoteSettings: null,
      });

      expect(onProgress).toHaveBeenCalledWith('bootstrapFetched');
      expect(onProgress).toHaveBeenCalledWith('dataPersisted');
      expect(onProgress).toHaveBeenCalledWith('homeserverSynced');
    });

    it('should work without progress callback', async () => {
      const bootstrapData = createMockBootstrapData();
      bootstrapData.notifications = [createMockNotification()];
      const mocks = setupMocks({ bootstrapData, unreadCount: 1 });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      assertCommonCalls(mocks, bootstrapData);
      expect(result).toEqual({
        notification: { unread: 1, lastRead: MOCK_LAST_READ, lastPolledTimestamp: expect.any(Number) },
        remoteSettings: null,
      });
    });

    it('should throw error when NexusBootstrapService fails', async () => {
      const mocks = setupMocks({ bootstrapError: new Error('Network error') });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow('Network error');

      expect(mocks.nexusFetch).toHaveBeenCalledWith(TEST_PUBKY);
      expect(mocks.persistUsers).not.toHaveBeenCalled();
    });

    it('should throw error when LocalPersistenceService fails', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData, persistUsersError: new Error('Database error') });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow('Database error');

      expect(mocks.persistUsers).toHaveBeenCalledWith(bootstrapData.users);
    });

    it('should handle empty bootstrap data', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      assertCommonCalls(mocks, bootstrapData);
      expect(result).toEqual({
        notification: { unread: 0, lastRead: MOCK_LAST_READ, lastPolledTimestamp: undefined },
        remoteSettings: null,
      });
    });

    it('should handle 404 homeserver error gracefully and create new lastRead', async () => {
      const bootstrapData = emptyBootstrap();
      const MOCK_NORMALIZED_TIMESTAMP = 9876543210;
      const MOCK_NORMALIZED_LAST_READ_URL = 'pubky://test-pubky/pub/pubky.app/last-read';
      const mockLastReadResult = {
        last_read: {
          timestamp: MOCK_NORMALIZED_TIMESTAMP,
          toJson: vi.fn(() => ({ timestamp: MOCK_NORMALIZED_TIMESTAMP })),
        },
        meta: { url: MOCK_NORMALIZED_LAST_READ_URL },
      };

      const mocks = setupMocks({ bootstrapData });
      const homeserverRequestSpy = vi.spyOn(Core.HomeserverService, 'request').mockImplementation(({ method, url }) => {
        if (method === Libs.HttpMethod.GET) {
          return Promise.reject(
            Libs.Err.client(Libs.ClientErrorCode.NOT_FOUND, 'Not found', {
              service: Libs.ErrorService.Homeserver,
              operation: 'request',
              context: { statusCode: Libs.HttpStatusCode.NOT_FOUND, url },
            }),
          );
        }
        return Promise.resolve(undefined);
      });
      mocks.homeserverRequest = homeserverRequestSpy;

      const lastReadNormalizerSpy = vi
        .spyOn(Core.LastReadNormalizer, 'to')
        .mockReturnValue(asOpaque<LastReadResult>(mockLastReadResult));
      const loggerInfoSpy = vi.spyOn(Libs.Logger, 'info').mockImplementation(() => {});

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(loggerInfoSpy).toHaveBeenCalledWith('Last read file not found, creating new one...', {
        pubky: TEST_PUBKY,
      });
      expect(lastReadNormalizerSpy).toHaveBeenCalledWith(TEST_PUBKY);
      expect(homeserverRequestSpy).toHaveBeenCalledWith({ method: Libs.HttpMethod.GET, url: MOCK_LAST_READ_URL });
      expect(homeserverRequestSpy).toHaveBeenCalledWith({
        method: Libs.HttpMethod.PUT,
        url: MOCK_NORMALIZED_LAST_READ_URL,
        bodyJson: mockLastReadResult.last_read.toJson(),
      });

      expect(mocks.persistUsers).toHaveBeenCalledWith(bootstrapData.users);
      expect(mocks.persistPosts).toHaveBeenCalledWith({ posts: bootstrapData.posts });
      expect(result).toEqual({
        notification: { unread: 0, lastRead: MOCK_NORMALIZED_TIMESTAMP, lastPolledTimestamp: undefined },
        remoteSettings: null,
      });
    });

    it('should throw error when homeserver returns 500 error', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      const homeserverRequestSpy = vi.spyOn(Core.HomeserverService, 'request').mockImplementation(({ method, url }) => {
        if (method === Libs.HttpMethod.GET) {
          return Promise.reject(
            Libs.Err.server(Libs.ServerErrorCode.INTERNAL_ERROR, 'Internal server error', {
              service: Libs.ErrorService.Homeserver,
              operation: 'request',
              context: { statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR, url },
            }),
          );
        }
        return Promise.resolve(undefined);
      });
      mocks.homeserverRequest = homeserverRequestSpy;

      const loggerErrorSpy = vi.spyOn(Libs.Logger, 'error').mockImplementation(() => {});

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toMatchObject({
        category: Libs.ErrorCategory.Server,
        code: Libs.ServerErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to fetch last read timestamp', expect.any(Error));
      expect(homeserverRequestSpy).toHaveBeenCalledWith({ method: Libs.HttpMethod.GET, url: MOCK_LAST_READ_URL });
      expect(homeserverRequestSpy).not.toHaveBeenCalledWith({
        method: Libs.HttpMethod.PUT,
        url: expect.any(String),
        bodyJson: expect.any(Object),
      });

      // fetchOrPutLastRead fails in the first Promise.all, so persistence is never reached
      expect(mocks.persistUsers).not.toHaveBeenCalled();
    });

    it('should throw error when homeserver returns network error', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      const homeserverRequestSpy = vi.spyOn(Core.HomeserverService, 'request').mockImplementation(({ method }) => {
        if (method === Libs.HttpMethod.GET) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve(undefined);
      });
      mocks.homeserverRequest = homeserverRequestSpy;

      const loggerErrorSpy = vi.spyOn(Libs.Logger, 'error').mockImplementation(() => {});

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow('Network timeout');

      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to fetch last read timestamp', expect.any(Error));
      expect(homeserverRequestSpy).toHaveBeenCalledWith({ method: Libs.HttpMethod.GET, url: MOCK_LAST_READ_URL });
      expect(homeserverRequestSpy).not.toHaveBeenCalledWith({
        method: Libs.HttpMethod.PUT,
        url: expect.any(String),
        bodyJson: expect.any(Object),
      });

      // fetchOrPutLastRead fails in the first Promise.all, so persistence is never reached
      expect(mocks.persistUsers).not.toHaveBeenCalled();
    });

    it('should throw error when persistPosts fails', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData, persistPostsError: new Error('Posts persistence error') });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow(
        'Posts persistence error',
      );

      expect(mocks.persistPosts).toHaveBeenCalledWith({ posts: bootstrapData.posts });
    });

    it('should throw error when upsert operations fail', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData, upsertPostsError: new Error('Stream upsert error') });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow(
        'Stream upsert error',
      );

      expect(mocks.upsertPostsStream).toHaveBeenCalledWith({
        streamId: Core.PostStreamTypes.TIMELINE_ALL_ALL,
        stream: bootstrapData.ids.stream,
      });
    });

    it('should throw error when bulkSave fails', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({
        bootstrapData,
        bulkSaveError: new Error('Notification persistence error'),
      });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow(
        'Notification persistence error',
      );

      expect(mocks.bulkSave).toHaveBeenCalledWith({ flatNotifications: [] });
    });

    it('should throw error when countUnreadSince fails', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({
        bootstrapData,
        countUnreadError: new Error('Count unread error'),
      });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow(
        'Count unread error',
      );

      expect(mocks.bulkSave).toHaveBeenCalledWith({ flatNotifications: [] });
      expect(mocks.countUnreadSince).toHaveBeenCalledWith(MOCK_LAST_READ);
    });

    it('should throw error when upsert influencers stream fails', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({
        bootstrapData,
        upsertInfluencersError: new Error('Influencers stream upsert error'),
      });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow(
        'Influencers stream upsert error',
      );

      expect(mocks.upsertInfluencersStream).toHaveBeenCalledWith({
        streamId: Core.UserStreamTypes.TODAY_INFLUENCERS_ALL,
        stream: bootstrapData.ids.influencers,
      });
    });

    it('should throw error when upsert tags stream fails', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({
        bootstrapData,
        upsertTagsError: new Error('Tags stream upsert error'),
      });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow(
        'Tags stream upsert error',
      );

      expect(mocks.upsertTagsStream).toHaveBeenCalledWith(Core.TagStreamTypes.TODAY_ALL, bootstrapData.ids.hot_tags);
    });

    it('should persist files from bootstrap payload', async () => {
      const bootstrapData = createMockBootstrapData();
      const mockFiles = asOpaque<Core.NexusFileDetails[]>([{ id: 'file-1' }, { id: 'file-2' }]);
      bootstrapData.files = mockFiles;
      bootstrapData.notifications = [createMockNotification()];

      const mocks = setupMocks({ bootstrapData, unreadCount: 1 });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.persistFiles).toHaveBeenCalledWith(mockFiles);
      expect(result).toEqual({
        notification: { unread: 1, lastRead: MOCK_LAST_READ, lastPolledTimestamp: expect.any(Number) },
        remoteSettings: null,
      });
    });

    it('should handle empty muted users list in bootstrap response', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.fetchMutedUsers).toHaveBeenCalledWith(TEST_PUBKY);
      expect(result).toEqual({
        notification: { unread: 0, lastRead: MOCK_LAST_READ, lastPolledTimestamp: undefined },
        remoteSettings: null,
      });
    });

    it('should fetch muted users during bootstrap (persist is inside fetchMutedUsers)', async () => {
      const bootstrapData = emptyBootstrap();
      const mutedUsers = ['muted-user-1', 'muted-user-2'] as Core.Pubky[];
      const mocks = setupMocks({ bootstrapData, mutedUsers });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.fetchMutedUsers).toHaveBeenCalledWith(TEST_PUBKY);
      expect(result).toEqual({
        notification: { unread: 0, lastRead: MOCK_LAST_READ, lastPolledTimestamp: undefined },
        remoteSettings: null,
      });
    });

    it('should throw error when MuteApplication.fetchMutedUsers fails', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({
        bootstrapData,
        fetchMutedUsersError: new Error('Mute fetch error'),
      });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow('Mute fetch error');

      expect(mocks.fetchMutedUsers).toHaveBeenCalledWith(TEST_PUBKY);
      // fetchMutedUsers fails in the first Promise.all, so persistence is never reached
      expect(mocks.persistUsers).not.toHaveBeenCalled();
    });
  });

  describe('non-indexed user handling', () => {
    it('should subscribe to TTL coordinator and write TTL record when user is not indexed', async () => {
      const bootstrapData = emptyBootstrap();
      bootstrapData.indexed = false;

      const mocks = setupMocks({ bootstrapData });

      const upsertTtlSpy = vi.spyOn(Core.LocalUserService, 'upsertTtlWithDelay').mockResolvedValue(undefined);
      const mockSubscribeUser = vi.fn();
      const mockGetInstance = vi.spyOn(Core.TtlCoordinator, 'getInstance').mockReturnValue(
        asOpaque<Core.TtlCoordinator>({
          subscribeUser: mockSubscribeUser,
        }),
      );
      const loggerWarnSpy = vi.spyOn(Libs.Logger, 'warn').mockImplementation(() => {});

      await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(loggerWarnSpy).toHaveBeenCalledWith('User is not indexed in Nexus. Scheduling TTL retry', {
        pubky: TEST_PUBKY,
        retryDelayMs: Libs.Env.NEXT_PUBLIC_TTL_RETRY_DELAY_MS,
      });
      expect(upsertTtlSpy).toHaveBeenCalledWith(TEST_PUBKY, Libs.Env.NEXT_PUBLIC_TTL_RETRY_DELAY_MS);
      expect(mockGetInstance).toHaveBeenCalled();
      expect(mockSubscribeUser).toHaveBeenCalledWith({ pubky: TEST_PUBKY });
      expect(mocks.persistUsers).toHaveBeenCalled();
      expect(mocks.persistPosts).toHaveBeenCalled();
    });

    it('should not subscribe to TTL coordinator when user is indexed', async () => {
      const bootstrapData = emptyBootstrap();
      bootstrapData.indexed = true;

      setupMocks({ bootstrapData });

      const upsertTtlSpy = vi.spyOn(Core.LocalUserService, 'upsertTtlWithDelay').mockResolvedValue(undefined);
      const mockSubscribeUser = vi.fn();
      vi.spyOn(Core.TtlCoordinator, 'getInstance').mockReturnValue(
        asOpaque<Core.TtlCoordinator>({
          subscribeUser: mockSubscribeUser,
        }),
      );
      const loggerWarnSpy = vi.spyOn(Libs.Logger, 'warn').mockImplementation(() => {});

      await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(loggerWarnSpy).not.toHaveBeenCalledWith(
        'User is not indexed in Nexus. Scheduling TTL retry',
        expect.any(Object),
      );
      expect(upsertTtlSpy).not.toHaveBeenCalled();
      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });
  });

  describe('settings initialization', () => {
    it('should call initializeSettings during bootstrap', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.initializeSettings).toHaveBeenCalledWith(TEST_PUBKY, MOCK_LOCAL_SETTINGS);
    });

    it('should return remote settings when remote settings are newer', async () => {
      const bootstrapData = emptyBootstrap();
      const remoteSettings: Core.SettingsState = {
        notifications: Core.defaultNotificationPreferences,
        privacy: Core.defaultPrivacyPreferences,
        muted: [],
        language: 'fr',
        updatedAt: Date.now(),
        version: 2,
      };

      setupMocks({ bootstrapData, remoteSettings });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(result.remoteSettings).toEqual(remoteSettings);
    });

    it('should return null remoteSettings when remote returns null', async () => {
      const bootstrapData = emptyBootstrap();

      setupMocks({ bootstrapData, remoteSettings: null });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(result.remoteSettings).toBeNull();
    });

    it('should not fail bootstrap when settings initialization fails', async () => {
      const bootstrapData = emptyBootstrap();
      const settingsInitError = new Error('Settings sync failed');

      const loggerErrorSpy = vi.spyOn(Libs.Logger, 'error').mockImplementation(() => {});
      const mocks = setupMocks({ bootstrapData, settingsInitError });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(result).toEqual({
        notification: { unread: 0, lastRead: MOCK_LAST_READ, lastPolledTimestamp: undefined },
        remoteSettings: null,
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to initialize settings during bootstrap', expect.any(Object));
      expect(mocks.initializeSettings).toHaveBeenCalledWith(TEST_PUBKY, MOCK_LOCAL_SETTINGS);
    });

    it('should initialize settings in parallel with bootstrap fetch', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.initializeSettings).toHaveBeenCalledWith(TEST_PUBKY, MOCK_LOCAL_SETTINGS);
      expect(mocks.nexusFetch).toHaveBeenCalledWith(TEST_PUBKY);
    });
  });
});
