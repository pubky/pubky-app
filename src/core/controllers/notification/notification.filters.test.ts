import { describe, it, expect } from 'vitest';
import { filterByPreferences, NOTIFICATION_TYPE_TO_PREFERENCE_KEY } from './notification.filters';
import { NotificationType, PostChangedSource } from '@/core/models/notification/notification.types';
import type { FlatNotification } from '@/core/models/notification/notification.types';
import type { NotificationPreferences } from '@/core/stores/settings/settings.types';
import { defaultNotificationPreferences } from '@/core/stores/settings/settings.types';

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

describe('filterByPreferences', () => {
  it('should return all notifications when all preferences are enabled', () => {
    const notifications = [
      makeNotification(NotificationType.Follow, 1000),
      makeNotification(NotificationType.Reply, 2000),
      makeNotification(NotificationType.PostDeleted, 3000),
    ];

    const result = filterByPreferences(notifications, defaultNotificationPreferences);

    expect(result).toHaveLength(3);
  });

  it('should filter out disabled notification types', () => {
    const notifications = [
      makeNotification(NotificationType.Follow, 1000),
      makeNotification(NotificationType.Reply, 2000),
      makeNotification(NotificationType.PostDeleted, 3000),
    ];
    const preferences: NotificationPreferences = {
      ...defaultNotificationPreferences,
      postDeleted: false,
    };

    const result = filterByPreferences(notifications, preferences);

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.type)).toEqual([NotificationType.Follow, NotificationType.Reply]);
  });

  it('should filter out multiple disabled types', () => {
    const notifications = [
      makeNotification(NotificationType.Follow, 1000),
      makeNotification(NotificationType.NewFriend, 2000),
      makeNotification(NotificationType.Reply, 3000),
      makeNotification(NotificationType.Repost, 4000),
    ];
    const preferences: NotificationPreferences = {
      ...defaultNotificationPreferences,
      follow: false,
      repost: false,
    };

    const result = filterByPreferences(notifications, preferences);

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.type)).toEqual([NotificationType.NewFriend, NotificationType.Reply]);
  });

  it('should return empty array when all preferences are disabled', () => {
    const notifications = [
      makeNotification(NotificationType.Follow, 1000),
      makeNotification(NotificationType.Reply, 2000),
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

    const result = filterByPreferences(notifications, preferences);

    expect(result).toHaveLength(0);
  });

  it('should return empty array when given empty notifications', () => {
    const result = filterByPreferences([], defaultNotificationPreferences);

    expect(result).toHaveLength(0);
  });

  it('should correctly map each notification type to its preference key', () => {
    const allTypes = Object.values(NotificationType);
    const notifications = allTypes.map((type, i) => makeNotification(type, (i + 1) * 1000));

    // Disable each type one at a time and verify only that type is filtered
    for (const disabledType of allTypes) {
      const preferences: NotificationPreferences = { ...defaultNotificationPreferences };
      preferences[NOTIFICATION_TYPE_TO_PREFERENCE_KEY[disabledType]] = false;

      const result = filterByPreferences(notifications, preferences);

      expect(result).toHaveLength(allTypes.length - 1);
      expect(result.every((n) => n.type !== disabledType)).toBe(true);
    }
  });
});
