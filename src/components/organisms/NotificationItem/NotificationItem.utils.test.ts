import { describe, expect, it } from 'vitest';
import { type FlatNotification, NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import {
  formatPreviewText,
  getNotificationActionText,
  getNotificationLink,
  hasPostPreview,
} from './NotificationItem.utils';

describe('NotificationItem utilities', () => {
  it('shows the subject preview for edited-collection notifications', () => {
    expect(hasPostPreview(NotificationType.PostEdited, 'collection')).toBe(true);
  });

  it.each([undefined, 'long', 'unknown'])('does not show an edited-post preview for post kind %s', (postKind) => {
    expect(hasPostPreview(NotificationType.PostEdited, postKind)).toBe(false);
  });

  it.each([
    [NotificationType.TagPost, 'collection', 'tagged your collection'],
    [NotificationType.TagPost, 'long', 'tagged your article'],
    [NotificationType.Reply, 'collection', 'replied to your collection'],
    [NotificationType.Reply, 'long', 'replied to your article'],
    [NotificationType.Repost, 'collection', 'reposted your collection'],
    [NotificationType.Repost, 'long', 'reposted your article'],
    [NotificationType.Mention, 'collection', 'mentioned you in a collection'],
    [NotificationType.Mention, 'long', 'mentioned you in an article'],
    [NotificationType.PostDeleted, 'collection', 'deleted a collection'],
    [NotificationType.PostDeleted, 'long', 'deleted an article'],
    [NotificationType.PostEdited, 'collection', 'updated collection'],
    [NotificationType.PostEdited, 'long', 'updated an article'],
  ])('uses kind-specific copy for %s notifications about %s posts', (type, postKind, expectedText) => {
    const notification = {
      id: `${type}:123:actor`,
      type,
      timestamp: 123,
      post_kind: postKind,
    } as FlatNotification;

    expect(getNotificationActionText(notification)).toBe(expectedText);
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

    expect(getNotificationActionText(notification)).toBe('edited a post you have interacted with');
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
  ])('keeps the existing live post target for a $label notification', ({ notification, expected }) => {
    const flatNotification = {
      id: `${notification.type}:123:actor`,
      timestamp: 123,
      post_kind: 'collection',
      ...notification,
    } as FlatNotification;

    expect(getNotificationLink(flatNotification).notificationLink).toBe(expected);
  });

  it('gives a deleted notification no post target, keeping the row informational', () => {
    // Design decision on PR #2314: the deleted post has no destination, so the row
    // must not navigate anywhere (the viewer's linked post is deliberately not used).
    const notification = {
      id: 'post_deleted:123:owner',
      type: NotificationType.PostDeleted,
      timestamp: 123,
      delete_source: PostChangedSource.Repost,
      deleted_by: 'owner',
      deleted_uri: 'pubky://owner/pub/pubky.app/posts/collection-id',
      linked_uri: 'pubky://viewer/pub/pubky.app/posts/linked-id',
      post_kind: 'collection',
    } satisfies FlatNotification;

    const { notificationLink, userProfileLink } = getNotificationLink(notification);

    expect(notificationLink).toBeNull();
    expect(userProfileLink).toBe('/profile/owner');
  });
});

describe('formatPreviewText', () => {
  it('returns null for missing content', () => {
    expect(formatPreviewText(null)).toBeNull();
    expect(formatPreviewText(undefined)).toBeNull();
    expect(formatPreviewText('')).toBeNull();
  });

  it('quotes and truncates ASCII content to 20 characters', () => {
    expect(formatPreviewText('This is a short post content')).toBe("'This is a short post...'");
    expect(formatPreviewText('Short')).toBe("'Short'");
  });

  it('keeps an emoji that sits at the 20th position instead of splitting its surrogate pair', () => {
    // 19 ASCII characters + one emoji = exactly 20 graphemes, so nothing is truncated.
    const preview = formatPreviewText('Then collapse them 🙃');

    expect(preview).toBe("'Then collapse them 🙃'");
    expect(preview).not.toContain('\uFFFD');
  });

  it('truncates on a grapheme boundary when an emoji straddles the limit', () => {
    const preview = formatPreviewText(`${'a'.repeat(19)}🙃🙃🙃`);

    expect(preview).toBe(`'${'a'.repeat(19)}🙃...'`);
    expect(preview).not.toContain('\uFFFD');
  });

  it('keeps a combining mark attached to its base character at the limit', () => {
    const preview = formatPreviewText(`${'a'.repeat(19)}e\u0301xyz`);

    expect(preview).toBe(`'${'a'.repeat(19)}e\u0301...'`);
    expect(preview).not.toContain('\uFFFD');
  });

  it('keeps a zero-width-joiner cluster whole at the limit', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const preview = formatPreviewText(`${'a'.repeat(19)}${family}`);

    expect(preview).toBe(`'${'a'.repeat(19)}${family}'`);
    expect(preview).not.toContain('\uFFFD');
  });
});
