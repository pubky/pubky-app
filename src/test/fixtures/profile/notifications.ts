// Consumed by `Profile.vrt.test.tsx` for the (default) Notifications tab.
import { type FlatNotification, NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import { HOUR_MS, MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_AUTHOR_PUBKYS } from '../feed/profiles';
import { VRT_NOTIFICATION_POSTS, VRT_PROFILE_POSTS, VRT_PROFILE_REPLY_PARENTS } from './posts';

const [FYNN_POST, GLEN_POST, HANA_COLLECTION, EIRA_POST] = VRT_NOTIFICATION_POSTS;
const [ALICE_FIRST_POST] = VRT_PROFILE_POSTS;
const [BRAN_PARENT] = VRT_PROFILE_REPLY_PARENTS;

/**
 * A rich, ordered mix of every `NotificationType` — newest first, matching
 * `NotificationController.getOrFetchNotifications` ordering. The first four
 * are treated as unread (see `VRT_UNREAD_NOTIFICATIONS`).
 */
export const VRT_NOTIFICATIONS: readonly FlatNotification[] = [
  {
    id: `${NotificationType.Follow}:${VRT_FROZEN_NOW_MS - 5 * MINUTE_MS}:${VRT_AUTHOR_PUBKYS.hana}`,
    type: NotificationType.Follow,
    timestamp: VRT_FROZEN_NOW_MS - 5 * MINUTE_MS,
    followed_by: VRT_AUTHOR_PUBKYS.hana,
  },
  {
    id: `${NotificationType.TagPost}:${VRT_FROZEN_NOW_MS - 20 * MINUTE_MS}:${VRT_AUTHOR_PUBKYS.bran}`,
    type: NotificationType.TagPost,
    timestamp: VRT_FROZEN_NOW_MS - 20 * MINUTE_MS,
    tagged_by: VRT_AUTHOR_PUBKYS.bran,
    tag_label: 'localfirst',
    post_uri: ALICE_FIRST_POST.details.uri,
    post_kind: ALICE_FIRST_POST.details.kind,
  },
  {
    id: `${NotificationType.Reply}:${VRT_FROZEN_NOW_MS - 35 * MINUTE_MS}:${VRT_AUTHOR_PUBKYS.eira}`,
    type: NotificationType.Reply,
    timestamp: VRT_FROZEN_NOW_MS - 35 * MINUTE_MS,
    replied_by: VRT_AUTHOR_PUBKYS.eira,
    parent_post_uri: ALICE_FIRST_POST.details.uri,
    reply_uri: EIRA_POST.details.uri,
    post_kind: 'short',
  },
  {
    id: `${NotificationType.NewFriend}:${VRT_FROZEN_NOW_MS - 55 * MINUTE_MS}:${VRT_AUTHOR_PUBKYS.glen}`,
    type: NotificationType.NewFriend,
    timestamp: VRT_FROZEN_NOW_MS - 55 * MINUTE_MS,
    followed_by: VRT_AUTHOR_PUBKYS.glen,
  },
  {
    id: `${NotificationType.Repost}:${VRT_FROZEN_NOW_MS - 2 * HOUR_MS}:${VRT_AUTHOR_PUBKYS.fynn}`,
    type: NotificationType.Repost,
    timestamp: VRT_FROZEN_NOW_MS - 2 * HOUR_MS,
    reposted_by: VRT_AUTHOR_PUBKYS.fynn,
    embed_uri: FYNN_POST.details.uri,
    repost_uri: `pubky://${VRT_AUTHOR_PUBKYS.fynn}/pub/pubky.app/posts/0VRTNOTIFREPOST001`,
    post_kind: 'short',
  },
  {
    id: `${NotificationType.Mention}:${VRT_FROZEN_NOW_MS - 4 * HOUR_MS}:${VRT_AUTHOR_PUBKYS.dion}`,
    type: NotificationType.Mention,
    timestamp: VRT_FROZEN_NOW_MS - 4 * HOUR_MS,
    mentioned_by: VRT_AUTHOR_PUBKYS.dion,
    post_uri: GLEN_POST.details.uri,
    post_kind: 'short',
  },
  {
    id: `${NotificationType.TagProfile}:${VRT_FROZEN_NOW_MS - 6 * HOUR_MS}:${VRT_AUTHOR_PUBKYS.cleo}`,
    type: NotificationType.TagProfile,
    timestamp: VRT_FROZEN_NOW_MS - 6 * HOUR_MS,
    tagged_by: VRT_AUTHOR_PUBKYS.cleo,
    tag_label: 'localfirst',
  },
  {
    id: `${NotificationType.PostEdited}:${VRT_FROZEN_NOW_MS - 10 * HOUR_MS}:${VRT_AUTHOR_PUBKYS.hana}`,
    type: NotificationType.PostEdited,
    timestamp: VRT_FROZEN_NOW_MS - 10 * HOUR_MS,
    edit_source: PostChangedSource.Bookmark,
    edited_by: VRT_AUTHOR_PUBKYS.hana,
    edited_uri: HANA_COLLECTION.details.uri,
    linked_uri: HANA_COLLECTION.details.uri,
    post_kind: 'collection',
  },
  {
    id: `${NotificationType.PostDeleted}:${VRT_FROZEN_NOW_MS - 18 * HOUR_MS}:${VRT_AUTHOR_PUBKYS.bran}`,
    type: NotificationType.PostDeleted,
    timestamp: VRT_FROZEN_NOW_MS - 18 * HOUR_MS,
    delete_source: PostChangedSource.ReplyParent,
    deleted_by: VRT_AUTHOR_PUBKYS.bran,
    deleted_uri: BRAN_PARENT.details.uri,
    linked_uri: BRAN_PARENT.details.uri,
    post_kind: 'short',
  },
  {
    id: `${NotificationType.Follow}:${VRT_FROZEN_NOW_MS - 30 * HOUR_MS}:${VRT_AUTHOR_PUBKYS.dion}`,
    type: NotificationType.Follow,
    timestamp: VRT_FROZEN_NOW_MS - 30 * HOUR_MS,
    followed_by: VRT_AUTHOR_PUBKYS.dion,
  },
];

/** The 4 most recent notifications render with the unread treatment. */
export const VRT_UNREAD_NOTIFICATIONS: readonly FlatNotification[] = VRT_NOTIFICATIONS.slice(0, 4);
