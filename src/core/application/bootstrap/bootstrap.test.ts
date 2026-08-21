import { LastReadResult } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TBootstrapParams } from '@/application/bootstrap/bootstrap.types';
import { FeedApplication } from '@/application/feed/feed';
import { FileApplication } from '@/application/file/file';
import { MuteApplication } from '@/application/mute/mute';
import { UserApplication } from '@/application/user/user';
import { getModerationId } from '@/config/moderation';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { getTtlRetryDelayMs } from '@/libs/runtime-config/runtime-config';
import { buildHotTagsId } from '@/models/hot/hot.helper';
import type { Pubky } from '@/models/models.types';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { TagStreamTypes } from '@/models/stream/tag/tagStream.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalHotService } from '@/services/local/hot/hot';
import { LocalNotificationService } from '@/services/local/notification/notification';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamTagsService } from '@/services/local/stream/tags/tags';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalUserService } from '@/services/local/user/user';
import { NexusBootstrapService } from '@/services/nexus/bootstrap/bootstrap';
import type { NexusBootstrapResponse } from '@/services/nexus/bootstrap/bootstrap.types';
import { type NexusFileDetails, type NexusNotification, UserStreamTimeframe } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { BootstrapApplication } from './bootstrap';

// Mock pubky-app-specs to avoid WebAssembly issues
vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
}));

const TEST_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const MOCK_LAST_READ_URL = 'http://example.com/last-read';
const MOCK_LAST_READ = 1234567890;
const MOCK_ALLOWED_TYPES = [NotificationType.Follow, NotificationType.Reply];

const emptyBootstrap = (): NexusBootstrapResponse => ({
  users: [],
  posts: [],
  files: [],
  ids: { stream: [], influencers: [], recommended: [], hot_tags: [] },
  indexed: true,
  notifications: [],
});

const createMockBootstrapData = (): NexusBootstrapResponse => ({
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
        collections: 0,
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
  },
  indexed: true,
  notifications: [],
});

const createMockNotification = (): NexusNotification => ({
  timestamp: Date.now(),
  body: { type: 'like', user_id: 'user-2', post_id: 'post-1' },
});

const createFlatNotification = (timestamp: number): FlatNotification =>
  ({
    type: NotificationType.Follow,
    timestamp,
    followed_by: `user-${timestamp}`,
  }) as FlatNotification;

const getBootstrapParams = (pubky: string): TBootstrapParams & { allowedTypes: NotificationType[] } => {
  const {
    meta: { url },
  } = NotificationNormalizer.to(pubky);
  return { pubky, lastReadUrl: url, allowedTypes: MOCK_ALLOWED_TYPES };
};

type MockConfig = {
  bootstrapData?: NexusBootstrapResponse | null;
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
  countFilteredError?: Error;
  mutedUsers?: Pubky[];
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
  countFilteredUnreadSince: unknown;
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
    countFilteredError,
    mutedUsers = [],
    fetchMutedUsersError,
    fetchFeedsError,
  } = config;

  vi.clearAllMocks();

  return {
    nexusFetch: vi
      .spyOn(NexusBootstrapService, 'fetch')
      .mockImplementation(
        bootstrapError
          ? () => Promise.reject(bootstrapError)
          : () => Promise.resolve(bootstrapData as NexusBootstrapResponse),
      ),
    homeserverRequest: vi
      .spyOn(HomeserverService, 'request')
      .mockImplementation(
        homeserverError ? () => Promise.reject(homeserverError) : () => Promise.resolve({ timestamp: MOCK_LAST_READ }),
      ),
    fetchMutedUsers: vi
      .spyOn(MuteApplication, 'fetchMutedUsers')
      .mockImplementation(
        fetchMutedUsersError ? () => Promise.reject(fetchMutedUsersError) : () => Promise.resolve(mutedUsers),
      ),
    fetchFeeds: vi
      .spyOn(FeedApplication, 'fetchFeeds')
      .mockImplementation(fetchFeedsError ? () => Promise.reject(fetchFeedsError) : () => Promise.resolve([])),
    persistUsers: vi
      .spyOn(LocalStreamUsersService, 'persistUsers')
      .mockImplementation(persistUsersError ? () => Promise.reject(persistUsersError) : () => Promise.resolve([])),
    persistPosts: vi
      .spyOn(LocalStreamPostsService, 'persistPosts')
      .mockImplementation(
        persistPostsError ? () => Promise.reject(persistPostsError) : () => Promise.resolve({ attachmentMetadata: [] }),
      ),
    persistFiles: vi
      .spyOn(FileApplication, 'persistFiles')
      .mockImplementation(
        persistFilesError ? () => Promise.reject(persistFilesError) : () => Promise.resolve(undefined),
      ),
    upsertPostsStream: vi
      .spyOn(LocalStreamPostsService, 'upsert')
      .mockImplementation(upsertPostsError ? () => Promise.reject(upsertPostsError) : () => Promise.resolve(undefined)),
    upsertInfluencersStream: vi
      .spyOn(LocalStreamUsersService, 'upsert')
      .mockImplementation(
        upsertInfluencersError ? () => Promise.reject(upsertInfluencersError) : () => Promise.resolve(undefined),
      ),
    upsertHotTags: vi.spyOn(LocalHotService, 'upsert').mockResolvedValue(undefined),
    upsertTagsStream: vi
      .spyOn(LocalStreamTagsService, 'upsert')
      .mockImplementation(upsertTagsError ? () => Promise.reject(upsertTagsError) : () => Promise.resolve(undefined)),
    bulkSave: vi
      .spyOn(LocalNotificationService, 'bulkSave')
      .mockImplementation(bulkSaveError ? () => Promise.reject(bulkSaveError) : () => Promise.resolve(undefined)),
    countFilteredUnreadSince: vi
      .spyOn(LocalNotificationService, 'countFilteredUnreadSince')
      .mockImplementation(
        countFilteredError ? () => Promise.reject(countFilteredError) : () => Promise.resolve(unreadCount),
      ),
  };
};

const assertCommonCalls = (mocks: ServiceMocks, bootstrapData: NexusBootstrapResponse) => {
  expect(mocks.nexusFetch).toHaveBeenCalledWith(TEST_PUBKY);
  expect(mocks.homeserverRequest).toHaveBeenCalledWith({ method: HttpMethod.GET, url: MOCK_LAST_READ_URL });
  expect(mocks.fetchMutedUsers).toHaveBeenCalledWith(TEST_PUBKY);
  expect(mocks.fetchFeeds).toHaveBeenCalledWith(TEST_PUBKY);
  expect(mocks.persistUsers).toHaveBeenCalledWith(bootstrapData.users);
  expect(mocks.persistPosts).toHaveBeenCalledWith({ posts: bootstrapData.posts });
  expect(mocks.upsertPostsStream).toHaveBeenCalledWith({
    streamId: PostStreamTypes.TIMELINE_ALL_ALL,
    stream: bootstrapData.ids.stream,
  });
  expect(mocks.upsertInfluencersStream).toHaveBeenCalledWith({
    streamId: UserStreamTypes.TODAY_INFLUENCERS_ALL,
    stream: bootstrapData.ids.influencers,
  });
  expect(mocks.upsertInfluencersStream).toHaveBeenCalledWith({
    streamId: UserStreamTypes.RECOMMENDED,
    stream: bootstrapData.ids.recommended,
  });
  expect(mocks.upsertHotTags).toHaveBeenCalledWith(
    buildHotTagsId(UserStreamTimeframe.TODAY, 'all'),
    bootstrapData.ids.hot_tags,
  );
  expect(mocks.upsertTagsStream).toHaveBeenCalledWith(TagStreamTypes.TODAY_ALL, bootstrapData.ids.hot_tags);
  expect(mocks.persistFiles).toHaveBeenCalledWith(bootstrapData.files);
  const flatNotifications = bootstrapData.notifications.map((n) => createFlatNotification(n.timestamp));
  expect(mocks.bulkSave).toHaveBeenCalledWith({ flatNotifications });
  expect(mocks.countFilteredUnreadSince).toHaveBeenCalledWith(MOCK_LAST_READ, MOCK_ALLOWED_TYPES);
};

afterEach(() => {
  BootstrapApplication.cancelModerationFollow();
  vi.restoreAllMocks();
});

describe('BootstrapApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NotificationNormalizer, 'to').mockReturnValue({
      meta: { url: MOCK_LAST_READ_URL },
    } as LastReadResult);
    vi.spyOn(NotificationNormalizer, 'toFlatNotification').mockImplementation((n) =>
      createFlatNotification(n.timestamp),
    );
    vi.spyOn(UserApplication, 'ensureModerationFollow').mockResolvedValue(undefined);
  });

  describe('read', () => {
    it('should successfully fetch and persist bootstrap data with notifications', async () => {
      const bootstrapData = createMockBootstrapData();
      const notification = createMockNotification();
      bootstrapData.notifications = [notification];
      const mocks = setupMocks({ bootstrapData, unreadCount: 1 });

      const onProgress = vi.fn();

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY), onProgress);

      assertCommonCalls(mocks, bootstrapData);
      expect(result).toEqual({
        unread: 1,
        lastRead: MOCK_LAST_READ,
        lastPolledTimestamp: notification.timestamp + 1,
      });

      expect(onProgress).toHaveBeenCalledWith('bootstrapFetched');
      expect(onProgress).toHaveBeenCalledWith('dataPersisted');
      expect(onProgress).toHaveBeenCalledWith('homeserverSynced');
    });

    it('should work without progress callback', async () => {
      const bootstrapData = createMockBootstrapData();
      const notification = createMockNotification();
      bootstrapData.notifications = [notification];
      const mocks = setupMocks({ bootstrapData, unreadCount: 1 });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      assertCommonCalls(mocks, bootstrapData);
      expect(result).toEqual({
        unread: 1,
        lastRead: MOCK_LAST_READ,
        lastPolledTimestamp: notification.timestamp + 1,
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
        unread: 0,
        lastRead: MOCK_LAST_READ,
        lastPolledTimestamp: undefined,
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
      const homeserverRequestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(({ method, url }) => {
        if (method === HttpMethod.GET) {
          return Promise.reject(
            Err.client(ClientErrorCode.NOT_FOUND, 'Not found', {
              service: ErrorService.Homeserver,
              operation: 'request',
              context: { statusCode: HttpStatusCode.NOT_FOUND, url },
            }),
          );
        }
        return Promise.resolve(undefined);
      });
      mocks.homeserverRequest = homeserverRequestSpy;

      const lastReadNormalizerSpy = vi
        .spyOn(LastReadNormalizer, 'to')
        .mockReturnValue(asOpaque<LastReadResult>(mockLastReadResult));
      const loggerInfoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {});

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(loggerInfoSpy).toHaveBeenCalledWith('Last read file not found, creating new one...', {
        pubky: TEST_PUBKY,
      });
      expect(lastReadNormalizerSpy).toHaveBeenCalledWith(TEST_PUBKY);
      expect(homeserverRequestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: MOCK_LAST_READ_URL });
      expect(homeserverRequestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: MOCK_NORMALIZED_LAST_READ_URL,
        bodyJson: mockLastReadResult.last_read.toJson(),
      });

      expect(mocks.persistUsers).toHaveBeenCalledWith(bootstrapData.users);
      expect(mocks.persistPosts).toHaveBeenCalledWith({ posts: bootstrapData.posts });
      expect(result).toEqual({
        unread: 0,
        lastRead: MOCK_NORMALIZED_TIMESTAMP,
        lastPolledTimestamp: undefined,
      });
    });

    it('should throw error when homeserver returns 500 error', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      const homeserverRequestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(({ method, url }) => {
        if (method === HttpMethod.GET) {
          return Promise.reject(
            Err.server(ServerErrorCode.INTERNAL_ERROR, 'Internal server error', {
              service: ErrorService.Homeserver,
              operation: 'request',
              context: { statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR, url },
            }),
          );
        }
        return Promise.resolve(undefined);
      });
      mocks.homeserverRequest = homeserverRequestSpy;

      const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch last read timestamp',
        expect.objectContaining({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
          message: 'Internal server error',
        }),
      );
      expect(homeserverRequestSpy).toHaveBeenCalledTimes(1);
      expect(homeserverRequestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: MOCK_LAST_READ_URL });

      // fetchOrPutLastRead fails in the first Promise.all, so persistence is never reached
      expect(mocks.persistUsers).not.toHaveBeenCalled();
    });

    it('should throw error when homeserver returns network error', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      const homeserverRequestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(({ method }) => {
        if (method === HttpMethod.GET) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve(undefined);
      });
      mocks.homeserverRequest = homeserverRequestSpy;

      const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow('Network timeout');

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch last read timestamp',
        expect.objectContaining({ message: 'Network timeout' }),
      );
      expect(homeserverRequestSpy).toHaveBeenCalledTimes(1);
      expect(homeserverRequestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: MOCK_LAST_READ_URL });

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
        streamId: PostStreamTypes.TIMELINE_ALL_ALL,
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

    it('should throw error when countFilteredUnreadSince fails', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({
        bootstrapData,
        countFilteredError: new Error('Count unread error'),
      });

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).rejects.toThrow(
        'Count unread error',
      );

      expect(mocks.bulkSave).toHaveBeenCalledWith({ flatNotifications: [] });
      expect(mocks.countFilteredUnreadSince).toHaveBeenCalledWith(MOCK_LAST_READ, MOCK_ALLOWED_TYPES);
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
        streamId: UserStreamTypes.TODAY_INFLUENCERS_ALL,
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

      expect(mocks.upsertTagsStream).toHaveBeenCalledWith(TagStreamTypes.TODAY_ALL, bootstrapData.ids.hot_tags);
    });

    it('should persist files from bootstrap payload', async () => {
      const bootstrapData = createMockBootstrapData();
      const mockFiles = asOpaque<NexusFileDetails[]>([{ id: 'file-1' }, { id: 'file-2' }]);
      bootstrapData.files = mockFiles;
      const notification = createMockNotification();
      bootstrapData.notifications = [notification];

      const mocks = setupMocks({ bootstrapData, unreadCount: 1 });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.persistFiles).toHaveBeenCalledWith(mockFiles);
      expect(result).toEqual({
        unread: 1,
        lastRead: MOCK_LAST_READ,
        lastPolledTimestamp: notification.timestamp + 1,
      });
    });

    it('should handle empty muted users list in bootstrap response', async () => {
      const bootstrapData = emptyBootstrap();
      const mocks = setupMocks({ bootstrapData });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.fetchMutedUsers).toHaveBeenCalledWith(TEST_PUBKY);
      expect(result).toEqual({
        unread: 0,
        lastRead: MOCK_LAST_READ,
        lastPolledTimestamp: undefined,
      });
    });

    it('starts the moderation follow only after bootstrap persistence completes', async () => {
      let resolvePersistUsers!: (value: []) => void;
      const persistUsersPending = new Promise<[]>((resolve) => {
        resolvePersistUsers = resolve;
      });
      setupMocks();
      const persistUsers = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockReturnValue(persistUsersPending);
      const ensureModerationFollow = vi.mocked(UserApplication.ensureModerationFollow);

      const initialize = BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      await vi.waitFor(() => expect(persistUsers).toHaveBeenCalled());
      expect(ensureModerationFollow).not.toHaveBeenCalled();

      resolvePersistUsers([]);
      await initialize;

      expect(ensureModerationFollow).toHaveBeenCalledWith(
        expect.objectContaining({
          follower: TEST_PUBKY,
          moderationId: getModerationId(),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('invalidates an older detached moderation follow when a new bootstrap starts', async () => {
      setupMocks();
      const signals: AbortSignal[] = [];
      vi.mocked(UserApplication.ensureModerationFollow).mockImplementation(({ signal }) => {
        if (signal) signals.push(signal);
        return new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
      });

      await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(false);

      await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
    });

    it('cancels the controller captured before bootstrap awaits complete', async () => {
      let resolveBootstrap!: (value: NexusBootstrapResponse) => void;
      const bootstrapPending = new Promise<NexusBootstrapResponse>((resolve) => {
        resolveBootstrap = resolve;
      });
      setupMocks();
      vi.spyOn(NexusBootstrapService, 'fetch').mockReturnValue(bootstrapPending);
      const ensureModerationFollow = vi.mocked(UserApplication.ensureModerationFollow);

      const initialize = BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));
      BootstrapApplication.cancelModerationFollow();
      resolveBootstrap(emptyBootstrap());
      await initialize;

      expect(ensureModerationFollow).toHaveBeenCalledWith(
        expect.objectContaining({ signal: expect.objectContaining({ aborted: true }) }),
      );
    });

    it('completes bootstrap while the moderation follow remains in flight', async () => {
      setupMocks();
      const ensureModerationFollow = vi
        .mocked(UserApplication.ensureModerationFollow)
        .mockImplementation(
          ({ signal }) =>
            new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true })),
        );

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).resolves.toEqual({
        unread: 0,
        lastRead: MOCK_LAST_READ,
        lastPolledTimestamp: undefined,
      });
      expect(ensureModerationFollow).toHaveBeenCalledOnce();
    });

    it('does not reject bootstrap or re-log an AppError from the moderation follow', async () => {
      setupMocks();
      const failure = Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Homeserver unavailable', {
        service: ErrorService.Homeserver,
        operation: 'ensureModerationFollow',
      });
      vi.mocked(UserApplication.ensureModerationFollow).mockRejectedValue(failure);
      const loggerWarn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).resolves.toBeDefined();

      await vi.waitFor(() => expect(UserApplication.ensureModerationFollow).toHaveBeenCalledOnce());
      expect(loggerWarn).not.toHaveBeenCalledWith('Unexpected moderation-follow bootstrap failure', expect.anything());
    });

    it('does not reject bootstrap and warns for an unreported moderation-follow failure', async () => {
      setupMocks();
      const failure = new Error('unexpected failure');
      vi.mocked(UserApplication.ensureModerationFollow).mockRejectedValue(failure);
      const loggerWarn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await expect(BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY))).resolves.toBeDefined();

      await vi.waitFor(() =>
        expect(loggerWarn).toHaveBeenCalledWith('Unexpected moderation-follow bootstrap failure', { error: failure }),
      );
    });

    it('should fetch muted users during bootstrap (persist is inside fetchMutedUsers)', async () => {
      const bootstrapData = emptyBootstrap();
      const mutedUsers = ['muted-user-1', 'muted-user-2'] as Pubky[];
      const mocks = setupMocks({ bootstrapData, mutedUsers });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.fetchMutedUsers).toHaveBeenCalledWith(TEST_PUBKY);
      expect(result).toEqual({
        unread: 0,
        lastRead: MOCK_LAST_READ,
        lastPolledTimestamp: undefined,
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

      const ingestSpy = vi.spyOn(NexusBootstrapService, 'ingest').mockResolvedValue(undefined);
      const upsertTtlSpy = vi.spyOn(LocalUserService, 'upsertTtlWithDelay').mockResolvedValue(undefined);
      const mockSubscribeUser = vi.fn();
      const mockGetInstance = vi.spyOn(TtlCoordinator, 'getInstance').mockReturnValue(
        asOpaque<TtlCoordinator>({
          subscribeUser: mockSubscribeUser,
        }),
      );
      const loggerWarnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(ingestSpy).toHaveBeenCalledWith(TEST_PUBKY);
      expect(loggerWarnSpy).toHaveBeenCalledWith('User is not indexed in Nexus. Scheduling TTL retry', {
        pubky: TEST_PUBKY,
        retryDelayMs: getTtlRetryDelayMs(),
      });
      expect(upsertTtlSpy).toHaveBeenCalledWith(TEST_PUBKY, getTtlRetryDelayMs());
      expect(mockGetInstance).toHaveBeenCalled();
      expect(mockSubscribeUser).toHaveBeenCalledWith({ pubky: TEST_PUBKY });
      expect(mocks.persistUsers).toHaveBeenCalled();
      expect(mocks.persistPosts).toHaveBeenCalled();
    });

    it('should not subscribe to TTL coordinator when user is indexed', async () => {
      const bootstrapData = emptyBootstrap();
      bootstrapData.indexed = true;

      setupMocks({ bootstrapData });

      const ingestSpy = vi.spyOn(NexusBootstrapService, 'ingest').mockResolvedValue(undefined);
      const upsertTtlSpy = vi.spyOn(LocalUserService, 'upsertTtlWithDelay').mockResolvedValue(undefined);
      const mockSubscribeUser = vi.fn();
      vi.spyOn(TtlCoordinator, 'getInstance').mockReturnValue(
        asOpaque<TtlCoordinator>({
          subscribeUser: mockSubscribeUser,
        }),
      );
      const loggerWarnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(ingestSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).not.toHaveBeenCalled();
      expect(upsertTtlSpy).not.toHaveBeenCalled();
      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });
  });
});
