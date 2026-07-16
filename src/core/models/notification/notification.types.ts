// Server API types
export enum NotificationType {
  Follow = 'follow',
  NewFriend = 'new_friend',
  TagPost = 'tag_post',
  TagProfile = 'tag_profile',
  Reply = 'reply',
  Repost = 'repost',
  Mention = 'mention',
  PostDeleted = 'post_deleted',
  PostEdited = 'post_edited',
}

export enum PostChangedSource {
  Reply = 'reply', // A reply to you was deleted/edited.
  Repost = 'repost', // A repost of your post was deleted/edited.
  Bookmark = 'bookmark', // A post you bookmarked was deleted/edited.
  ReplyParent = 'reply_parent', // The parent post of your reply was deleted/edited.
  RepostEmbed = 'repost_embed', // The embedded post on your repost was deleted/edited.
  TaggedPost = 'tagged_post', // A post you tagged was deleted/edited.
}

export type NotificationVariantMap = {
  [NotificationType.Follow]: FollowNotification;
  [NotificationType.NewFriend]: NewFriendNotification;
  [NotificationType.TagPost]: TagPostNotification;
  [NotificationType.TagProfile]: TagProfileNotification;
  [NotificationType.Reply]: ReplyNotification;
  [NotificationType.Repost]: RepostNotification;
  [NotificationType.Mention]: MentionNotification;
  [NotificationType.PostDeleted]: PostDeletedNotification;
  [NotificationType.PostEdited]: PostEditedNotification;
};

export type CommonFields = {
  id: string; // Business key: type:timestamp:actor - unique identifier for deduplication
  timestamp: number;
  type: NotificationType;
};

export type FollowNotification = {
  followed_by: string;
};

export type NewFriendNotification = {
  followed_by: string;
};

export type TagPostNotification = {
  tagged_by: string;
  tag_label: string;
  post_uri: string;
  post_kind?: string;
};

export type TagProfileNotification = {
  tagged_by: string;
  tag_label: string;
};

export type ReplyNotification = {
  replied_by: string;
  parent_post_uri: string;
  reply_uri: string;
  post_kind?: string;
};

export type RepostNotification = {
  reposted_by: string;
  embed_uri: string;
  repost_uri: string;
  post_kind?: string;
};

export type MentionNotification = {
  mentioned_by: string;
  post_uri: string;
  post_kind?: string;
};

export type PostDeletedNotification = {
  delete_source: PostChangedSource;
  deleted_by: string;
  deleted_uri: string;
  linked_uri: string;
  post_kind?: string;
};

export type PostEditedNotification = {
  edit_source: PostChangedSource;
  edited_by: string;
  edited_uri: string;
  linked_uri: string;
  post_kind?: string;
};

/**
 * Utility type that flattens a map of notification variants into a union type.
 * Each variant includes its type key, specific fields, and common fields.
 * @template TMap - The map of notification types keyed by NotificationType
 * @template Common - The common fields shared across all notification types
 */
type FlatFromMap<TMap, Common> = {
  [K in keyof TMap]: { type: K } & TMap[K] & Common;
}[keyof TMap];

/**
 * Flattened notification type that combines all notification variants with their specific fields
 * and common fields (timestamp, type) into a discriminated union.
 * The `id` field is a unique key generated from the notification's type, timestamp, and actor.
 */
export type FlatNotification = FlatFromMap<NotificationVariantMap, CommonFields>;
