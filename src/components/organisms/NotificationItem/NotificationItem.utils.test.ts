import { describe, expect, it } from 'vitest';
import { type FlatNotification, NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import { getNotificationActionKey, getNotificationLink, hasPostPreview } from './NotificationItem.utils';

describe('NotificationItem utilities', () => {
  it('shows the subject preview for edited-collection notifications', () => {
    expect(hasPostPreview(NotificationType.PostEdited, 'collection')).toBe(true);
  });

  it.each([undefined, 'long', 'unknown'])('does not show an edited-post preview for post kind %s', (postKind) => {
    expect(hasPostPreview(NotificationType.PostEdited, postKind)).toBe(false);
  });

  it.each([
    [NotificationType.TagPost, 'collection', 'taggedCollection'],
    [NotificationType.TagPost, 'long', 'taggedArticle'],
    [NotificationType.Reply, 'collection', 'repliedToCollection'],
    [NotificationType.Reply, 'long', 'repliedToArticle'],
    [NotificationType.Repost, 'collection', 'repostedCollection'],
    [NotificationType.Repost, 'long', 'repostedArticle'],
    [NotificationType.Mention, 'collection', 'mentionedYouInCollection'],
    [NotificationType.Mention, 'long', 'mentionedYouInArticle'],
    [NotificationType.PostDeleted, 'collection', 'deletedCollection'],
    [NotificationType.PostDeleted, 'long', 'deletedArticle'],
    [NotificationType.PostEdited, 'collection', 'updatedCollection'],
    [NotificationType.PostEdited, 'long', 'updatedArticle'],
  ])('uses kind-specific copy for %s notifications about %s posts', (type, postKind, expectedKey) => {
    const notification = {
      id: `${type}:123:actor`,
      type,
      timestamp: 123,
      post_kind: postKind,
    } as FlatNotification;

    expect(getNotificationActionKey(notification)).toBe(expectedKey);
  });

  it.each([undefined, 'short', 'unknown', 'audio'])('uses generic copy for post kind %s', (postKind) => {
    const notification = {
      id: 'post_edited:123:owner',
      type: NotificationType.PostEdited,
      timestamp: 123,
      edit_source: PostChangedSource.Repost,
      edited_by: 'owner',
      edited_uri: 'pubky://owner/pub/pubky.app/posts/post-id',
      linked_uri: 'pubky://viewer/pub/pubky.app/posts/repost-id',
      post_kind: postKind,
    } satisfies FlatNotification;

    expect(getNotificationActionKey(notification)).toBe('editedPost');
  });

  it.each([
    ['collection', '/collections/owner/post-id'],
    ['long', '/post/owner/post-id'],
  ])('links an updated %s to the correct detail page', (postKind, expectedRoute) => {
    const notification = {
      id: 'post_edited:123:owner',
      type: NotificationType.PostEdited,
      timestamp: 123,
      edit_source: PostChangedSource.Repost,
      edited_by: 'owner',
      edited_uri: 'pubky://owner/pub/pubky.app/posts/post-id',
      linked_uri: 'pubky://viewer/pub/pubky.app/posts/repost-id',
      post_kind: postKind,
    } satisfies FlatNotification;

    expect(getNotificationLink(notification).notificationLink).toBe(expectedRoute);
  });

  it.each([
    {
      label: 'tagged collection',
      notification: {
        type: NotificationType.TagPost,
        tagged_by: 'actor',
        tag_label: 'curated',
        post_uri: 'pubky://owner/pub/pubky.app/posts/collection-id',
      },
    },
    {
      label: 'collection reply parent',
      notification: {
        type: NotificationType.Reply,
        replied_by: 'actor',
        parent_post_uri: 'pubky://owner/pub/pubky.app/posts/collection-id',
        reply_uri: 'pubky://actor/pub/pubky.app/posts/reply-id',
      },
    },
    {
      label: 'collection mention',
      notification: {
        type: NotificationType.Mention,
        mentioned_by: 'actor',
        post_uri: 'pubky://owner/pub/pubky.app/posts/collection-id',
      },
    },
  ])('links a $label notification to the collection detail page', ({ notification }) => {
    const flatNotification = {
      id: `${notification.type}:123:actor`,
      timestamp: 123,
      post_kind: 'collection',
      ...notification,
    } as FlatNotification;

    expect(getNotificationLink(flatNotification).notificationLink).toBe('/collections/owner/collection-id');
  });

  it.each([
    {
      label: 'repost',
      expected: '/post/actor/repost-id',
      notification: {
        type: NotificationType.Repost,
        reposted_by: 'actor',
        embed_uri: 'pubky://owner/pub/pubky.app/posts/collection-id',
        repost_uri: 'pubky://actor/pub/pubky.app/posts/repost-id',
      },
    },
    {
      label: 'deleted collection',
      expected: '/post/viewer/linked-id',
      notification: {
        type: NotificationType.PostDeleted,
        delete_source: PostChangedSource.Repost,
        deleted_by: 'owner',
        deleted_uri: 'pubky://owner/pub/pubky.app/posts/collection-id',
        linked_uri: 'pubky://viewer/pub/pubky.app/posts/linked-id',
      },
    },
  ])('keeps the existing live post target for a $label notification', ({ notification, expected }) => {
    const flatNotification = {
      id: `${notification.type}:123:actor`,
      timestamp: 123,
      post_kind: 'collection',
      ...notification,
    } as FlatNotification;

    expect(getNotificationLink(flatNotification).notificationLink).toBe(expected);
  });
});
