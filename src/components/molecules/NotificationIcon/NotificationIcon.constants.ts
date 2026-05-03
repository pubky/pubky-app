/**
 * Icon size in pixels
 */
import { AtSign, HeartHandshake, MessageCircle, Repeat, StickyNote, Tag, Trash2, UserRoundPlus } from 'lucide-react';
import { NotificationType } from '@/models/notification/notification.types';

export const ICON_SIZE = 24;

/**
 * Unread badge size in pixels
 */
export const BADGE_SIZE = 11;

/**
 * Mapping of notification types to their corresponding Lucide icon components
 */
export const NOTIFICATION_ICON_MAP = {
  [NotificationType.Follow]: UserRoundPlus,
  [NotificationType.NewFriend]: HeartHandshake,
  [NotificationType.TagPost]: Tag,
  [NotificationType.TagProfile]: Tag,
  [NotificationType.Reply]: MessageCircle,
  [NotificationType.Repost]: Repeat,
  [NotificationType.Mention]: AtSign,
  [NotificationType.PostDeleted]: Trash2,
  [NotificationType.PostEdited]: StickyNote,
} as const;
