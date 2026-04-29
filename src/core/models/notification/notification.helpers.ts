import { NotificationType, type FlatNotification } from '@/models/notification/notification.types';
// Generate business key inline
// Used for unread lookup to match against unreadNotifications
export const getBusinessKey = (n: FlatNotification): string => {
  const base = `${n.type}:${n.timestamp}`;
  switch (n.type) {
    case NotificationType.Follow:
    case NotificationType.NewFriend:
      return `${base}:${n.followed_by}`;
    case NotificationType.TagPost:
      return `${base}:${n.tagged_by}:${n.post_uri}`;
    case NotificationType.TagProfile:
      return `${base}:${n.tagged_by}:${n.tag_label}`;
    case NotificationType.Reply:
      return `${base}:${n.replied_by}:${n.reply_uri}`;
    case NotificationType.Repost:
      return `${base}:${n.reposted_by}:${n.repost_uri}`;
    case NotificationType.Mention:
      return `${base}:${n.mentioned_by}:${n.post_uri}`;
    case NotificationType.PostDeleted:
      return `${base}:${n.deleted_by}:${n.deleted_uri}`;
    case NotificationType.PostEdited:
      return `${base}:${n.edited_by}:${n.edited_uri}`;
    default:
      return base;
  }
};
