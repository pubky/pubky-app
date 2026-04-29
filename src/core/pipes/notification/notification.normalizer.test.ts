import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LastReadResult } from 'pubky-app-specs';
import { asOpaque } from '@/test-utils';
import {
  TEST_PUBKY,
  INVALID_INPUTS,
  setupUnitTestMocks,
  setupIntegrationTestMocks,
  restoreMocks,
  buildPubkyUri,
} from '../pipes.test-utils';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { NotificationType } from '@/models/notification/notification.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import type { NexusNotification } from '@/services/nexus/nexus.types';
describe('NotificationNormalizer', () => {
  /**
   * Tests for `to` method - Creates LastRead result (same as LastReadNormalizer)
   */
  describe('to', () => {
    const createMockBuilder = (overrides?: Partial<{ createLastRead: ReturnType<typeof vi.fn> }>) => ({
      createLastRead: vi.fn(() => {
        const mockTimestamp = BigInt(Date.now());
        return asOpaque<LastReadResult>({
          last_read: {
            timestamp: mockTimestamp,
            toJson: vi.fn(() => ({ timestamp: Number(mockTimestamp) })),
          },
          meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, 'last_read') },
        });
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
        const result = NotificationNormalizer.to(TEST_PUBKY.USER_1);

        expect(result).toHaveProperty('last_read');
        expect(result).toHaveProperty('meta');
      });

      it('should call PubkySpecsSingleton.get with pubky and createLastRead without params', () => {
        NotificationNormalizer.to(TEST_PUBKY.USER_1);

        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
        expect(mockBuilder.createLastRead).toHaveBeenCalledWith();
      });

      it('should throw AppError with correct properties when createLastRead fails', () => {
        const errorMessage = 'Invalid last read';
        mockBuilder.createLastRead.mockImplementation(() => {
          throw errorMessage;
        });

        try {
          NotificationNormalizer.to(TEST_PUBKY.USER_1);
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
        vi.spyOn(PubkySpecsSingleton, 'get').mockImplementation(() => {
          throw 'Singleton error';
        });

        expect(() => NotificationNormalizer.to(TEST_PUBKY.USER_1)).toThrow(AppError);
      });
    });

    describe('Integration Tests', () => {
      beforeEach(setupIntegrationTestMocks);
      afterEach(restoreMocks);

      it('should create valid result with correct URL format', () => {
        const result = NotificationNormalizer.to(TEST_PUBKY.USER_1);

        expect(result.last_read).toBeDefined();
        expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/last_read$/);
      });

      it('should have BigInt timestamp', () => {
        const result = NotificationNormalizer.to(TEST_PUBKY.USER_1);
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
        NotificationNormalizer.to(TEST_PUBKY.USER_1); // Initialize
        const result = NotificationNormalizer.to(invalidPubky);
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
      type: NotificationType,
      body: Record<string, unknown>,
      timestamp = 1700000000000,
    ): NexusNotification => ({
      timestamp,
      body: { type, ...body },
    });

    const sampleNotifications = {
      follow: createNexusNotification(NotificationType.Follow, {
        followed_by: TEST_PUBKY.USER_2,
      }),
      newFriend: createNexusNotification(NotificationType.NewFriend, {
        followed_by: TEST_PUBKY.USER_2,
      }),
      reply: createNexusNotification(NotificationType.Reply, {
        replied_by: TEST_PUBKY.USER_2,
        reply_uri: 'pubky://author/pub/pubky.app/posts/reply123',
      }),
      repost: createNexusNotification(NotificationType.Repost, {
        reposted_by: TEST_PUBKY.USER_2,
        repost_uri: 'pubky://author/pub/pubky.app/posts/repost123',
      }),
      mention: createNexusNotification(NotificationType.Mention, {
        mentioned_by: TEST_PUBKY.USER_2,
        post_uri: 'pubky://author/pub/pubky.app/posts/mention123',
      }),
      tagPost: createNexusNotification(NotificationType.TagPost, {
        tagged_by: TEST_PUBKY.USER_2,
        post_uri: 'pubky://author/pub/pubky.app/posts/tagged123',
      }),
      tagProfile: createNexusNotification(NotificationType.TagProfile, {
        tagged_by: TEST_PUBKY.USER_2,
        tag_label: 'developer',
      }),
    };

    describe('transformation', () => {
      it('should transform NexusNotification to FlatNotification', () => {
        const result = NotificationNormalizer.toFlatNotification(sampleNotifications.follow);

        expect(result).toHaveProperty('timestamp', sampleNotifications.follow.timestamp);
        expect(result).toHaveProperty('type', NotificationType.Follow);
      });

      it('should spread body properties into flat structure', () => {
        const result = NotificationNormalizer.toFlatNotification(sampleNotifications.reply);

        expect(result.type).toBe(NotificationType.Reply);
        expect(result).toHaveProperty('replied_by', TEST_PUBKY.USER_2);
        expect(result).toHaveProperty('reply_uri');
      });

      it.each([
        ['Follow', sampleNotifications.follow, NotificationType.Follow],
        ['NewFriend', sampleNotifications.newFriend, NotificationType.NewFriend],
        ['Reply', sampleNotifications.reply, NotificationType.Reply],
        ['Repost', sampleNotifications.repost, NotificationType.Repost],
        ['Mention', sampleNotifications.mention, NotificationType.Mention],
        ['TagPost', sampleNotifications.tagPost, NotificationType.TagPost],
        ['TagProfile', sampleNotifications.tagProfile, NotificationType.TagProfile],
      ])('should handle %s notification type', (_, notification, expectedType) => {
        const result = NotificationNormalizer.toFlatNotification(notification);

        expect(result.type).toBe(expectedType);
        expect(result.timestamp).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('should handle notification with minimal body', () => {
        const minimalNotification: NexusNotification = {
          timestamp: 1700000000000,
          body: { type: NotificationType.Follow, followed_by: TEST_PUBKY.USER_2 },
        };

        const result = NotificationNormalizer.toFlatNotification(minimalNotification);

        expect(result.timestamp).toBe(1700000000000);
        expect(result.type).toBe(NotificationType.Follow);
      });

      it('should preserve all body properties in flat notification', () => {
        const notificationWithExtra: NexusNotification = {
          timestamp: 1700000000000,
          body: {
            type: NotificationType.Reply,
            replied_by: TEST_PUBKY.USER_2,
            reply_uri: 'pubky://uri',
            extra_field: 'extra_value',
          },
        };

        const result = NotificationNormalizer.toFlatNotification(notificationWithExtra);

        expect(result).toHaveProperty('extra_field', 'extra_value');
      });
    });
  });
});
