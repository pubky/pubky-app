import { describe, expect, it } from 'vitest';
import { type FlatNotification, NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import { getNotificationActionKey, getNotificationLink } from './NotificationItem.utils';

const postEditedNotification = {
  id: 'post_edited:123:author1',
  type: NotificationType.PostEdited,
  timestamp: Date.now(),
  edit_source: PostChangedSource.Repost,
  edited_by: 'author1',
  edited_uri: 'pubky://author1/pub/pubky.app/posts/item123',
  linked_uri: 'pubky://viewer/pub/pubky.app/posts/repost456',
} as FlatNotification;

describe('getNotificationActionKey', () => {
  it('returns updatedCollection for PostEdited when post kind is collection', () => {
    expect(getNotificationActionKey(postEditedNotification, 'collection')).toBe('updatedCollection');
  });

  it('returns editedPost for PostEdited when post kind is not collection', () => {
    expect(getNotificationActionKey(postEditedNotification, 'short')).toBe('editedPost');
  });

  it('returns editedPost for PostEdited when post kind is unknown', () => {
    expect(getNotificationActionKey(postEditedNotification)).toBe('editedPost');
    expect(getNotificationActionKey(postEditedNotification, null)).toBe('editedPost');
  });
});

describe('getNotificationLink', () => {
  it('links PostEdited collection notifications to the collection route', () => {
    const { notificationLink } = getNotificationLink(postEditedNotification, 'collection');
    expect(notificationLink).toBe('/collections/author1/item123');
  });

  it('links PostEdited non-collection notifications to the post route', () => {
    const { notificationLink } = getNotificationLink(postEditedNotification, 'short');
    expect(notificationLink).toBe('/post/author1/item123');
  });

  it('falls back to the post route when post kind is unknown', () => {
    const { notificationLink } = getNotificationLink(postEditedNotification);
    expect(notificationLink).toBe('/post/author1/item123');
  });
});
