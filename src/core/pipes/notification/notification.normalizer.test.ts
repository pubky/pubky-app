import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Core from '@/core';
import { AppError, ErrorCategory, ValidationErrorCode, ErrorService } from '@/libs';
import { LastReadResult } from 'pubky-app-specs';
import { NotificationType, PostChangedSource } from '@/core/models/notification/notification.types';
import type { FlatNotification } from '@/core/models/notification/notification.types';
import type { NotificationPreferences } from '@/core/stores/settings/settings.types';
import { defaultNotificationPreferences } from '@/core/stores/settings/settings.types';
import { NotificationNormalizer } from './notification.normalizer';
import {
  TEST_PUBKY,
  INVALID_INPUTS,
  setupUnitTestMocks,
  setupIntegrationTestMocks,
  restoreMocks,
  buildPubkyUri,
} from '../pipes.test-utils';

describe('NotificationNormalizer', () => {
  const makeNotification = (type: NotificationType, timestamp: number): FlatNotification => {
    const base = { id: `${type}:${timestamp}:actor`, timestamp, type };

    switch (type) {
      case NotificationType.Follow:
        return { ...base, type, followed_by: 'user-1' };
      case NotificationType.NewFriend:
        return { ...base, type, followed_by: 'user-1' };
      case NotificationType.TagPost:
        return { ...base, type, tagged_by: 'user-1', tag_label: 'test', post_uri: 'pubky://post/1' };
      case NotificationType.TagProfile:
        return { ...base, type, tagged_by: 'user-1', tag_label: 'test' };
      case NotificationType.Reply:
        return { ...base, type, replied_by: 'user-1', parent_post_uri: 'pubky://post/1', reply_uri: 'pubky://post/2' };
      case NotificationType.Repost:
        return { ...base, type, reposted_by: 'user-1', embed_uri: 'pubky://post/1', repost_uri: 'pubky://post/2' };
      case NotificationType.Mention:
        return { ...base, type, mentioned_by: 'user-1', post_uri: 'pubky://post/1' };
      case NotificationType.PostDeleted:
        return {
          ...base,
          type,
          delete_source: PostChangedSource.Reply,
          deleted_by: 'user-1',
          deleted_uri: 'pubky://post/1',
          linked_uri: 'pubky://post/2',
        };
      case NotificationType.PostEdited:
        return {
          ...base,
          type,
          edit_source: PostChangedSource.Reply,
          edited_by: 'user-1',
          edited_uri: 'pubky://post/1',
          linked_uri: 'pubky://post/2',
        };
      default: {
        const _exhaustive: never = type;
        throw new Error(`Unhandled notification type: ${_exhaustive}`);
      }
    }
  };

  /**
   * Tests for `to` method - Creates LastRead result (same as LastReadNormalizer)
   */
  describe('to', () => {
    const createMockBuilder = (overrides?: Partial<{ createLastRead: ReturnType<typeof vi.fn> }>) => ({
      createLastRead: vi.fn(() => {
        const mockTimestamp = BigInt(Date.now());
        return {
          last_read: {
            timestamp: mockTimestamp,
            toJson: vi.fn(() => ({ timestamp: Number(mockTimestamp) })),
          },
          meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, 'last_read') },
        } as unknown as LastReadResult;
      }),
      ...overrides,
    });

    describe('Unit Tests', () => {
      let mockBuilder: ReturnType<typeof createMockBuilder>;

      beforeEach(() => {
        mockBuilder = createMockBuilder();
        setupUnitTestMocks(mockBuilder);
      });

      afterEach(restoreMocks);

      it('should create last read with last_read and meta properties', () => {
        const result = Core.NotificationNormalizer.to(TEST_PUBKY.USER_1);

        expect(result).toHaveProperty('last_read');
        expect(result).toHaveProperty('meta');
      });

      it('should call PubkySpecsSingleton.get with pubky and createLastRead without params', () => {
        Core.NotificationNormalizer.to(TEST_PUBKY.USER_1);

        expect(Core.PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
        expect(mockBuilder.createLastRead).toHaveBeenCalledWith();
      });

      it('should throw AppError with correct properties when createLastRead fails', () => {
        const errorMessage = 'Invalid last read';
        mockBuilder.createLastRead.mockImplementation(() => {
          throw errorMessage;
        });

        try {
          Core.NotificationNormalizer.to(TEST_PUBKY.USER_1);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createLastRead');
          expect(appError.context).toEqual({ pubky: TEST_PUBKY.USER_1 });
          expect(appError.message).toBe(errorMessage);
        }
      });

      it('should throw AppError when PubkySpecsSingleton.get fails', () => {
        vi.spyOn(Core.PubkySpecsSingleton, 'get').mockImplementation(() => {
          throw 'Singleton error';
        });

        expect(() => Core.NotificationNormalizer.to(TEST_PUBKY.USER_1)).toThrow(AppError);
      });
    });

    describe('Integration Tests', () => {
      beforeEach(setupIntegrationTestMocks);
      afterEach(restoreMocks);

      it('should create valid result with correct URL format', () => {
        const result = Core.NotificationNormalizer.to(TEST_PUBKY.USER_1);

        expect(result.last_read).toBeDefined();
        expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/last_read$/);
      });

      it('should have BigInt timestamp', () => {
        const result = Core.NotificationNormalizer.to(TEST_PUBKY.USER_1);
        expect(typeof result.last_read.timestamp).toBe('bigint');
      });

      /**
       * Note: createLastRead() takes no parameters, so validation only happens
       * at singleton initialization. Once initialized, invalid pubkys don't throw.
       */
      it.each([
        ['empty', INVALID_INPUTS.EMPTY],
        ['null', INVALID_INPUTS.NULL],
        ['undefined', INVALID_INPUTS.UNDEFINED],
      ])('should not throw for %s pubky (singleton already initialized)', (_, invalidPubky) => {
        Core.NotificationNormalizer.to(TEST_PUBKY.USER_1); // Initialize
        const result = Core.NotificationNormalizer.to(invalidPubky);
        expect(result).toBeDefined();
      });
    });
  });

  /**
   * Tests for `toFlatNotification` method - Transforms NexusNotification to FlatNotification
   */
  describe('toFlatNotification', () => {
    // Sample notification data for different types
    const createNexusNotification = (
      type: Core.NotificationType,
      body: Record<string, unknown>,
      timestamp = 1700000000000,
    ): Core.NexusNotification => ({
      timestamp,
      body: { type, ...body },
    });

    const sampleNotifications = {
      follow: createNexusNotification(Core.NotificationType.Follow, {
        followed_by: TEST_PUBKY.USER_2,
      }),
      newFriend: createNexusNotification(Core.NotificationType.NewFriend, {
        followed_by: TEST_PUBKY.USER_2,
      }),
      reply: createNexusNotification(Core.NotificationType.Reply, {
        replied_by: TEST_PUBKY.USER_2,
        reply_uri: 'pubky://author/pub/pubky.app/posts/reply123',
      }),
      repost: createNexusNotification(Core.NotificationType.Repost, {
        reposted_by: TEST_PUBKY.USER_2,
        repost_uri: 'pubky://author/pub/pubky.app/posts/repost123',
      }),
      mention: createNexusNotification(Core.NotificationType.Mention, {
        mentioned_by: TEST_PUBKY.USER_2,
        post_uri: 'pubky://author/pub/pubky.app/posts/mention123',
      }),
      tagPost: createNexusNotification(Core.NotificationType.TagPost, {
        tagged_by: TEST_PUBKY.USER_2,
        post_uri: 'pubky://author/pub/pubky.app/posts/tagged123',
      }),
      tagProfile: createNexusNotification(Core.NotificationType.TagProfile, {
        tagged_by: TEST_PUBKY.USER_2,
        tag_label: 'developer',
      }),
    };

    describe('transformation', () => {
      it('should transform NexusNotification to FlatNotification', () => {
        const result = Core.NotificationNormalizer.toFlatNotification(sampleNotifications.follow);

        expect(result).toHaveProperty('timestamp', sampleNotifications.follow.timestamp);
        expect(result).toHaveProperty('type', Core.NotificationType.Follow);
      });

      it('should spread body properties into flat structure', () => {
        const result = Core.NotificationNormalizer.toFlatNotification(sampleNotifications.reply);

        expect(result.type).toBe(Core.NotificationType.Reply);
        expect(result).toHaveProperty('replied_by', TEST_PUBKY.USER_2);
        expect(result).toHaveProperty('reply_uri');
      });

      it.each([
        ['Follow', sampleNotifications.follow, Core.NotificationType.Follow],
        ['NewFriend', sampleNotifications.newFriend, Core.NotificationType.NewFriend],
        ['Reply', sampleNotifications.reply, Core.NotificationType.Reply],
        ['Repost', sampleNotifications.repost, Core.NotificationType.Repost],
        ['Mention', sampleNotifications.mention, Core.NotificationType.Mention],
        ['TagPost', sampleNotifications.tagPost, Core.NotificationType.TagPost],
        ['TagProfile', sampleNotifications.tagProfile, Core.NotificationType.TagProfile],
      ])('should handle %s notification type', (_, notification, expectedType) => {
        const result = Core.NotificationNormalizer.toFlatNotification(notification);

        expect(result.type).toBe(expectedType);
        expect(result.timestamp).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('should handle notification with minimal body', () => {
        const minimalNotification: Core.NexusNotification = {
          timestamp: 1700000000000,
          body: { type: Core.NotificationType.Follow, followed_by: TEST_PUBKY.USER_2 },
        };

        const result = Core.NotificationNormalizer.toFlatNotification(minimalNotification);

        expect(result.timestamp).toBe(1700000000000);
        expect(result.type).toBe(Core.NotificationType.Follow);
      });

      it('should preserve all body properties in flat notification', () => {
        const notificationWithExtra: Core.NexusNotification = {
          timestamp: 1700000000000,
          body: {
            type: Core.NotificationType.Reply,
            replied_by: TEST_PUBKY.USER_2,
            reply_uri: 'pubky://uri',
            extra_field: 'extra_value',
          },
        };

        const result = Core.NotificationNormalizer.toFlatNotification(notificationWithExtra);

        expect(result).toHaveProperty('extra_field', 'extra_value');
      });
    });
  });

  describe('filterByPreferences', () => {
    it('should return all notifications when all preferences are enabled', () => {
      const notifications = [
        makeNotification(Core.NotificationType.Follow, 1000),
        makeNotification(Core.NotificationType.Reply, 2000),
        makeNotification(Core.NotificationType.PostDeleted, 3000),
      ];

      const result = NotificationNormalizer.filterByPreferences(notifications, defaultNotificationPreferences);

      expect(result).toHaveLength(3);
    });

    it('should filter out disabled notification types', () => {
      const notifications = [
        makeNotification(Core.NotificationType.Follow, 1000),
        makeNotification(Core.NotificationType.Reply, 2000),
        makeNotification(Core.NotificationType.PostDeleted, 3000),
      ];
      const preferences: NotificationPreferences = {
        ...defaultNotificationPreferences,
        postDeleted: false,
      };

      const result = NotificationNormalizer.filterByPreferences(notifications, preferences);

      expect(result).toHaveLength(2);
      expect(result.map((n) => n.type)).toEqual([Core.NotificationType.Follow, Core.NotificationType.Reply]);
    });

    it('should filter out multiple disabled types', () => {
      const notifications = [
        makeNotification(Core.NotificationType.Follow, 1000),
        makeNotification(Core.NotificationType.NewFriend, 2000),
        makeNotification(Core.NotificationType.Reply, 3000),
        makeNotification(Core.NotificationType.Repost, 4000),
      ];
      const preferences: NotificationPreferences = {
        ...defaultNotificationPreferences,
        follow: false,
        repost: false,
      };

      const result = NotificationNormalizer.filterByPreferences(notifications, preferences);

      expect(result).toHaveLength(2);
      expect(result.map((n) => n.type)).toEqual([Core.NotificationType.NewFriend, Core.NotificationType.Reply]);
    });

    it('should return empty array when all preferences are disabled', () => {
      const notifications = [
        makeNotification(Core.NotificationType.Follow, 1000),
        makeNotification(Core.NotificationType.Reply, 2000),
      ];
      const preferences: NotificationPreferences = {
        follow: false,
        newFriend: false,
        tagPost: false,
        tagProfile: false,
        mention: false,
        reply: false,
        repost: false,
        postDeleted: false,
        postEdited: false,
      };

      const result = NotificationNormalizer.filterByPreferences(notifications, preferences);

      expect(result).toHaveLength(0);
    });

    it('should return empty array when given empty notifications', () => {
      const result = NotificationNormalizer.filterByPreferences([], defaultNotificationPreferences);

      expect(result).toHaveLength(0);
    });

    it('should correctly map each notification type to its preference key', () => {
      const allTypes = Object.values(Core.NotificationType);
      const notifications = allTypes.map((type, i) => makeNotification(type, (i + 1) * 1000));

      for (const disabledType of allTypes) {
        const preferences: NotificationPreferences = { ...defaultNotificationPreferences };
        preferences[Core.NOTIFICATION_TYPE_TO_PREFERENCE_KEY[disabledType]] = false;

        const result = NotificationNormalizer.filterByPreferences(notifications, preferences);

        expect(result).toHaveLength(allTypes.length - 1);
        expect(result.every((n) => n.type !== disabledType)).toBe(true);
      }
    });
  });

  describe('toEnabledTypes', () => {
    it('should return all types when all preferences are enabled', () => {
      const result = NotificationNormalizer.toEnabledTypes(defaultNotificationPreferences);

      expect(result).toHaveLength(Object.values(Core.NotificationType).length);
      expect(result).toEqual(expect.arrayContaining(Object.values(Core.NotificationType)));
    });

    it('should exclude disabled types', () => {
      const preferences: NotificationPreferences = {
        ...defaultNotificationPreferences,
        follow: false,
        repost: false,
      };

      const result = NotificationNormalizer.toEnabledTypes(preferences);

      expect(result).not.toContain(Core.NotificationType.Follow);
      expect(result).not.toContain(Core.NotificationType.Repost);
      expect(result).toHaveLength(Object.values(Core.NotificationType).length - 2);
    });

    it('should return empty array when all preferences are disabled', () => {
      const preferences: NotificationPreferences = {
        follow: false,
        newFriend: false,
        tagPost: false,
        tagProfile: false,
        mention: false,
        reply: false,
        repost: false,
        postDeleted: false,
        postEdited: false,
      };

      const result = NotificationNormalizer.toEnabledTypes(preferences);

      expect(result).toHaveLength(0);
    });
  });
});
