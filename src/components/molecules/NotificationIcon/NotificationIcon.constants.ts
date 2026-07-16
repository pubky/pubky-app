/**
 * Icon size in pixels
 */
import {
  AtSign,
  CirclePlay,
  Download,
  HeartHandshake,
  Image,
  Library,
  Link,
  type LucideIcon,
  MessageCircle,
  Newspaper,
  Repeat,
  StickyNote,
  Tag,
  Trash2,
  UserRoundPlus,
} from 'lucide-react';
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

/**
 * Known Nexus post kinds and their category icons.
 * Unknown future kinds intentionally fall back to the notification-type icon.
 */
export const POST_KIND_ICON_MAP: Partial<Record<string, LucideIcon>> = {
  short: StickyNote,
  long: Newspaper,
  image: Image,
  video: CirclePlay,
  link: Link,
  file: Download,
  collection: Library,
};
