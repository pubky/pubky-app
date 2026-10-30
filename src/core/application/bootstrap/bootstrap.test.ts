import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TBootstrapParams } from '@/application/bootstrap/bootstrap.types';
import { FeedApplication } from '@/application/feed/feed';
import { FileApplication } from '@/application/file/file';
import { MuteApplication } from '@/application/mute/mute';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpStatusCodeToError } from '@/libs/error/error.http';
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
import {
  HOMESERVER_PUBLISH_CONFLICT_MESSAGE,
  installHomeserverWriteRetryDependenciesForTests,
} from '@/services/homeserver/write-retry';
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

const TEST_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const MOCK_LAST_READ_URL = `pubky://${TEST_PUBKY}/priv/app.pubky/v1/last_read.json`;
const LEGACY_LAST_READ_URL = LastReadNormalizer.buildLegacyUrl(TEST_PUBKY);
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

const getBootstrapParams = (pubky: string): TBootstrapParams & { allowedTypes: NotificationType[] } => ({
  pubky,
  lastReadUrl: MOCK_LAST_READ_URL,
  allowedTypes: MOCK_ALLOWED_TYPES,
});

/** A GET answered 404: the file is absent. */
const notFound = (url: string) =>
  Err.client(ClientErrorCode.NOT_FOUND, 'Not found', {
    service: ErrorService.Homeserver,
    operation: 'request',
    context: { statusCode: HttpStatusCode.NOT_FOUND, url },
  });

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
  clearUnreadPostsStream: unknown;
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
      .mockImplementation(persistPostsError ? () => Promise.reject(persistPostsError) : () => Promise.resolve()),
    persistFiles: vi
      .spyOn(FileApplication, 'persistFiles')
      .mockImplementation(
        persistFilesError ? () => Promise.reject(persistFilesError) : () => Promise.resolve(undefined),
      ),
    upsertPostsStream: vi
      .spyOn(LocalStreamPostsService, 'upsert')
      .mockImplementation(upsertPostsError ? () => Promise.reject(upsertPostsError) : () => Promise.resolve(undefined)),
    clearUnreadPostsStream: vi.spyOn(LocalStreamPostsService, 'clearUnreadStream').mockResolvedValue([]),
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
  expect(mocks.persistUsers).toHaveBeenCalledWith(
    bootstrapData.users,
    expect.objectContaining({ revisions: expect.any(Map), viewerId: TEST_PUBKY }),
  );
  expect(mocks.persistPosts).toHaveBeenCalledWith({
    posts: bootstrapData.posts,
    tagGuard: expect.objectContaining({ revisions: expect.any(Map) }),
  });
  expect(mocks.upsertPostsStream).toHaveBeenCalledWith({
    streamId: PostStreamTypes.TIMELINE_ALL_ALL,
    stream: bootstrapData.ids.stream,
  });
  // The bootstrap page supersedes anything an earlier head poll collected.
  expect(mocks.clearUnreadPostsStream).toHaveBeenCalledWith({ streamId: PostStreamTypes.TIMELINE_ALL_ALL });
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
  vi.restoreAllMocks();
});

describe('BootstrapApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NotificationNormalizer, 'toFlatNotification').mockImplementation((n) =>
      createFlatNotification(n.timestamp),
    );
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

      expect(mocks.persistUsers).toHaveBeenCalledWith(
        bootstrapData.users,
        expect.objectContaining({ revisions: expect.any(Map), viewerId: TEST_PUBKY }),
      );
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

    it('reads the v1 lastRead without touching the 0.x file', async () => {
      const mocks = setupMocks({ bootstrapData: emptyBootstrap() });

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(mocks.homeserverRequest).toHaveBeenCalledExactlyOnceWith({
        method: HttpMethod.GET,
        url: MOCK_LAST_READ_URL,
      });
      expect(result.lastRead).toBe(MOCK_LAST_READ);
    });

    describe('when creating the missing lastRead hits the publish conflict', () => {
      const MOCK_NORMALIZED_TIMESTAMP = 9876543210;
      const LEGACY_TIMESTAMP = 1234;
      const publishConflict = () =>
        httpStatusCodeToError(
          409,
          `Request failed: Server responded with an error: 409 Conflict - ${HOMESERVER_PUBLISH_CONFLICT_MESSAGE}`,
          ErrorService.Homeserver,
          'request',
          MOCK_LAST_READ_URL,
        );

      const run = async (existsAfterConflict: boolean, legacy?: number) => {
        setupMocks({ bootstrapData: emptyBootstrap() });
        let puts = 0;
        const requestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(({ method, url }) => {
          if (method === HttpMethod.GET) {
            if (url === LEGACY_LAST_READ_URL && legacy !== undefined) return Promise.resolve({ timestamp: legacy });
            return Promise.reject(notFound(url));
          }
          puts += 1;
          return puts === 1 ? Promise.reject(publishConflict()) : Promise.resolve(undefined);
        });
        const existsSpy = vi.spyOn(HomeserverService, 'exists').mockResolvedValue(existsAfterConflict);
        vi.spyOn(LastReadNormalizer, 'to').mockReturnValue({
          url: MOCK_LAST_READ_URL,
          lastRead: { timestamp: MOCK_NORMALIZED_TIMESTAMP },
        });
        vi.spyOn(Logger, 'info').mockImplementation(() => {});

        const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));
        await vi.waitFor(() => expect(existsSpy).toHaveBeenCalledWith(MOCK_LAST_READ_URL));
        await new Promise((resolve) => setTimeout(resolve, 0));
        return { result, puts: requestSpy.mock.calls.filter(([params]) => params.method === HttpMethod.PUT) };
      };

      beforeEach(() => {
        installHomeserverWriteRetryDependenciesForTests({ sleep: async () => {}, random: () => 0 });
      });

      afterEach(() => {
        installHomeserverWriteRetryDependenciesForTests(null);
      });

      it('keeps a lastRead another client created meanwhile instead of overwriting it', async () => {
        const { puts } = await run(true);

        expect(puts).toHaveLength(1);
        expect(puts[0][0]).toMatchObject({ url: MOCK_LAST_READ_URL, fence: expect.anything() });
      });

      it('writes again when the lastRead is still missing', async () => {
        const { puts } = await run(false);

        expect(puts).toHaveLength(2);
        expect(puts[1][0]).toEqual(puts[0][0]);
      });

      it('keeps a v1 lastRead another client created before the retried copy of the 0.x one', async () => {
        const { result, puts } = await run(true, LEGACY_TIMESTAMP);

        expect(result.lastRead).toBe(LEGACY_TIMESTAMP);
        expect(puts).toHaveLength(1);
        expect(puts[0][0]).toMatchObject({ url: MOCK_LAST_READ_URL, bodyJson: { timestamp: LEGACY_TIMESTAMP } });
      });
    });

    it('copies the 0.x lastRead to the v1 file when only the 0.x one exists', async () => {
      const LEGACY_TIMESTAMP = 1234;
      const mocks = setupMocks({ bootstrapData: emptyBootstrap() });
      const homeserverRequestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(({ method, url }) => {
        if (method !== HttpMethod.GET) return Promise.resolve(undefined);
        if (url === LEGACY_LAST_READ_URL) return Promise.resolve({ timestamp: LEGACY_TIMESTAMP });
        return Promise.reject(notFound(url));
      });
      mocks.homeserverRequest = homeserverRequestSpy;
      const lastReadNormalizerSpy = vi.spyOn(LastReadNormalizer, 'to');
      const loggerInfoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {});

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(loggerInfoSpy).toHaveBeenCalledWith('Last read file found at its 0.x path only, copying it...', {
        pubky: TEST_PUBKY,
      });
      expect(lastReadNormalizerSpy).not.toHaveBeenCalled();
      expect(homeserverRequestSpy.mock.calls.map(([params]) => [params.method, params.url])).toEqual([
        [HttpMethod.GET, MOCK_LAST_READ_URL],
        [HttpMethod.GET, LEGACY_LAST_READ_URL],
        [HttpMethod.PUT, MOCK_LAST_READ_URL],
      ]);
      expect(homeserverRequestSpy).toHaveBeenLastCalledWith({
        method: HttpMethod.PUT,
        url: MOCK_LAST_READ_URL,
        bodyJson: { timestamp: LEGACY_TIMESTAMP },
        fence: expect.anything(),
      });
      expect(mocks.countFilteredUnreadSince).toHaveBeenCalledWith(LEGACY_TIMESTAMP, MOCK_ALLOWED_TYPES);
      expect(result.lastRead).toBe(LEGACY_TIMESTAMP);
    });

    it('should handle 404 homeserver error gracefully and create new lastRead', async () => {
      const bootstrapData = emptyBootstrap();
      const MOCK_NORMALIZED_TIMESTAMP = 9876543210;

      const mocks = setupMocks({ bootstrapData });
      const homeserverRequestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(({ method, url }) => {
        if (method === HttpMethod.GET) return Promise.reject(notFound(url));
        return Promise.resolve(undefined);
      });
      mocks.homeserverRequest = homeserverRequestSpy;

      const lastReadNormalizerSpy = vi
        .spyOn(LastReadNormalizer, 'to')
        .mockReturnValue({ url: MOCK_LAST_READ_URL, lastRead: { timestamp: MOCK_NORMALIZED_TIMESTAMP } });
      const loggerInfoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {});

      const result = await BootstrapApplication.initialize(getBootstrapParams(TEST_PUBKY));

      expect(loggerInfoSpy).toHaveBeenCalledWith('Last read file not found, creating new one...', {
        pubky: TEST_PUBKY,
      });
      expect(lastReadNormalizerSpy).toHaveBeenCalledWith(TEST_PUBKY);
      expect(homeserverRequestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: MOCK_LAST_READ_URL });
      expect(homeserverRequestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: LEGACY_LAST_READ_URL });
      expect(homeserverRequestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: MOCK_LAST_READ_URL,
        bodyJson: { timestamp: MOCK_NORMALIZED_TIMESTAMP },
        fence: expect.anything(),
      });

      expect(mocks.persistUsers).toHaveBeenCalledWith(
        bootstrapData.users,
        expect.objectContaining({ revisions: expect.any(Map), viewerId: TEST_PUBKY }),
      );
      expect(mocks.persistPosts).toHaveBeenCalledWith({
        posts: bootstrapData.posts,
        tagGuard: expect.objectContaining({ revisions: expect.any(Map) }),
      });
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

      // The error factory already reported the failure; bootstrap does not log it again
      expect(loggerErrorSpy).not.toHaveBeenCalledWith('Failed to fetch last read timestamp', expect.anything());
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

      expect(loggerErrorSpy).not.toHaveBeenCalledWith('Failed to fetch last read timestamp', expect.anything());
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

      expect(mocks.persistPosts).toHaveBeenCalledWith({
        posts: bootstrapData.posts,
        tagGuard: expect.objectContaining({ revisions: expect.any(Map) }),
      });
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
          retryUserIndexing: mockSubscribeUser,
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
          retryUserIndexing: mockSubscribeUser,
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
