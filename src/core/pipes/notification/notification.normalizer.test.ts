import { describe, expect, it } from 'vitest';
import { NotificationType } from '@/models/notification/notification.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import type { NexusNotification } from '@/services/nexus/nexus.types';
import { defaultNotificationPreferences, type NotificationPreferences } from '@/stores/settings/settings.types';
import { TEST_PUBKY } from '../pipes.test-utils';

describe('NotificationNormalizer', () => {
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

      it('should preserve the subject post kind from Nexus', () => {
        const nexusNotification = createNexusNotification(NotificationType.PostEdited, {
          edited_by: TEST_PUBKY.USER_2,
          edit_source: 'repost',
          edited_uri: 'pubky://author/pub/pubky.app/posts/collection123',
          linked_uri: 'pubky://viewer/pub/pubky.app/posts/repost123',
          post_kind: 'collection',
        });

        const result = NotificationNormalizer.toFlatNotification(nexusNotification);

        expect(result).toHaveProperty('post_kind', 'collection');
      });

      // Nexus serves the 0.x kind names while it reads both epochs; a stored v1 name passed
      // through must still render as the local kind.
      it.each([
        ['short', 'short'],
        ['long', 'long'],
        ['collection', 'collection'],
        ['image', 'image'],
        ['note', 'short'],
        ['article', 'long'],
        ['Article', 'long'],
        ['poll', 'poll'],
      ])('maps a subject post kind of %s to the local %s', (postKind, local) => {
        const result = NotificationNormalizer.toFlatNotification(
          createNexusNotification(NotificationType.Mention, {
            mentioned_by: TEST_PUBKY.USER_2,
            post_uri: 'pubky://author/pub/social/v1/posts/mention123',
            post_kind: postKind,
          }),
        );

        expect(result).toHaveProperty('post_kind', local);
      });

      it('leaves a notification without a subject post kind without one', () => {
        const result = NotificationNormalizer.toFlatNotification(sampleNotifications.follow);

        expect(result).not.toHaveProperty('post_kind');
      });

      it('keeps the business key independent of the kind spelling', () => {
        const body = { mentioned_by: TEST_PUBKY.USER_2, post_uri: 'pubky://author/pub/social/v1/posts/m1' };
        const v1 = createNexusNotification(NotificationType.Mention, { ...body, post_kind: 'note' });
        const legacy = createNexusNotification(NotificationType.Mention, { ...body, post_kind: 'short' });

        expect(NotificationNormalizer.toFlatNotification(v1).id).toBe(
          NotificationNormalizer.toFlatNotification(legacy).id,
        );
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

  describe('toEnabledTypes', () => {
    it('should return all types when all preferences are enabled', () => {
      const result = NotificationNormalizer.toEnabledTypes(defaultNotificationPreferences);

      expect(result).toHaveLength(Object.values(NotificationType).length);
      expect(result).toEqual(expect.arrayContaining(Object.values(NotificationType)));
    });

    it('should exclude disabled types', () => {
      const preferences: NotificationPreferences = {
        ...defaultNotificationPreferences,
        follow: false,
        repost: false,
      };

      const result = NotificationNormalizer.toEnabledTypes(preferences);

      expect(result).not.toContain(NotificationType.Follow);
      expect(result).not.toContain(NotificationType.Repost);
      expect(result).toHaveLength(Object.values(NotificationType).length - 2);
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
