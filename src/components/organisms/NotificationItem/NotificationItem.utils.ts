import { APP_ROUTES, POST_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import { Logger } from '@/libs/logger/logger';
import { truncateString } from '@/libs/utils/utils';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { USER_CENTRIC_NOTIFICATION_TYPES } from './NotificationItem.constants';

// ============================================================================
// NOTIFICATION TEXT UTILITIES
// ============================================================================

/**
 * Translation keys for notification action text
 * Returns the i18n key to be used with useTranslations('notifications.actions')
 */
const NOTIFICATION_ACTION_KEY: Record<NotificationType, string> = {
  [NotificationType.Follow]: 'followedYou',
  [NotificationType.NewFriend]: 'newFriend',
  [NotificationType.TagPost]: 'taggedPost',
  [NotificationType.TagProfile]: 'taggedProfile',
  [NotificationType.Reply]: 'repliedToPost',
  [NotificationType.Repost]: 'repostedPost',
  [NotificationType.Mention]: 'mentionedYou',
  [NotificationType.PostDeleted]: 'deletedPost',
  [NotificationType.PostEdited]: 'editedPost',
};

/**
 * Get notification action translation key (without the username) based on type
 * Returns the i18n key to be used with useTranslations('notifications.actions')
 */
export function getNotificationActionKey(notification: FlatNotification): string {
  return NOTIFICATION_ACTION_KEY[notification.type] ?? 'fallback';
}

/**
 * Extract user ID from notification based on type
 */
export function getUserIdFromNotification(notification: FlatNotification): string {
  switch (notification.type) {
    case NotificationType.Follow:
    case NotificationType.NewFriend:
      return notification.followed_by;
    case NotificationType.TagPost:
    case NotificationType.TagProfile:
      return notification.tagged_by;
    case NotificationType.Reply:
      return notification.replied_by;
    case NotificationType.Repost:
      return notification.reposted_by;
    case NotificationType.Mention:
      return notification.mentioned_by;
    case NotificationType.PostDeleted:
      return notification.deleted_by;
    case NotificationType.PostEdited:
      return notification.edited_by;
    default:
      return '';
  }
}

// ============================================================================
// NOTIFICATION LINK UTILITIES
// ============================================================================

/**
 * Convert a pubky URI or composite ID to a URL path format (userId/postId).
 * Uses shared composite ID utilities.
 * Supports:
 * - pubky:// URI format: pubky://userId/pub/pubky.app/posts/postId
 * - Composite ID format: userId:postId
 * Returns: userId/postId
 */
function uriToUrlPath(uri: string | undefined): string | null {
  if (!uri) return null;

  let compositeId: string | null = null;

  // Handle pubky:// URI format
  if (uri.startsWith('pubky://')) {
    compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS });
  }
  // Handle composite ID format (userId:postId)
  else if (uri.includes(':')) {
    compositeId = uri;
  }

  if (!compositeId) return null;

  try {
    // Parse the composite ID to get userId and postId
    const { pubky, id } = parseCompositeId(compositeId);
    return `${pubky}/${id}`;
  } catch (error) {
    Logger.debug('Failed to parse composite ID', { compositeId, error });
    return null;
  }
}

/**
 * Get the appropriate post link for a notification based on its type
 * Uses TypeScript's discriminated union type narrowing for type safety
 */
function getPostLink(notification: FlatNotification): string | null {
  let uri: string | undefined;

  switch (notification.type) {
    case NotificationType.Reply:
      // Navigate to parent post so user sees the full thread with the reply in context
      uri = notification.parent_post_uri;
      break;

    case NotificationType.Mention:
      uri = notification.post_uri;
      break;

    case NotificationType.TagPost:
      uri = notification.post_uri;
      break;

    case NotificationType.Repost:
      uri = notification.repost_uri;
      break;

    case NotificationType.PostDeleted:
      uri = notification.linked_uri;
      break;

    case NotificationType.PostEdited:
      uri = notification.edited_uri;
      break;

    case NotificationType.Follow:
    case NotificationType.NewFriend:
      // User-centric notifications - no post link
      return null;

    case NotificationType.TagProfile:
      // When someone tags your profile, link to your tagged page
      return PROFILE_ROUTES.UNIQUE_TAGS;

    default:
      return null;
  }

  // Convert URI to URL path format
  const urlPath = uriToUrlPath(uri);
  return urlPath ? `${POST_ROUTES.POST}/${urlPath}` : null;
}

/**
 * Get the user profile link for the notification actor
 */
function getUserProfileLink(userId: string): string {
  return `${APP_ROUTES.PROFILE}/${userId}`;
}

/**
 * Check if notification should use user profile as main link
 */
function shouldUsePrimaryUserLink(notification: FlatNotification): boolean {
  return (USER_CENTRIC_NOTIFICATION_TYPES as readonly NotificationType[]).includes(notification.type);
}

/**
 * Calculate notification links based on notification type and data.
 * Pure function that separates business logic from presentation layer.
 *
 * @param notification - The notification to process
 * @returns Object with notificationLink and userProfileLink
 */
export function getNotificationLink(notification: FlatNotification) {
  // Get user ID to create profile link
  const userId = getUserIdFromNotification(notification);
  const userProfileLink = userId ? getUserProfileLink(userId) : null;

  // Determine the main notification link
  // For user-centric notifications (follow/unfollow/friend), use profile link
  // For post-centric notifications, use post link
  const postLink = getPostLink(notification);
  const usePrimaryUserLink = shouldUsePrimaryUserLink(notification);
  const notificationLink = usePrimaryUserLink ? userProfileLink : postLink;

  return {
    notificationLink,
    userProfileLink,
  };
}

// ============================================================================
// NOTIFICATION PREVIEW UTILITIES
// ============================================================================

/**
 * Extract the post URI from a notification that has an associated post.
 * Returns the URI in composite format (author:postId) that can be used to fetch post content.
 */
export function getPostUriFromNotification(notification: FlatNotification): string | null {
  switch (notification.type) {
    case NotificationType.Reply:
      // For replies, show the content of the reply itself
      return notification.reply_uri ?? null;
    case NotificationType.Mention:
      // For mentions, show the content of the post that mentions the user
      return notification.post_uri ?? null;
    case NotificationType.Repost:
      // For reposts, show the content of the original post that was reposted
      return notification.embed_uri ?? null;
    case NotificationType.TagPost:
      // For tagged posts, show the content of the tagged post
      return notification.post_uri ?? null;
    case NotificationType.PostDeleted:
      // For deleted posts, we could show the linked post content
      return notification.linked_uri ?? null;
    case NotificationType.PostEdited:
      // For edited posts, show the edited post content
      return notification.edited_uri ?? null;
    default:
      return null;
  }
}

/**
 * Convert a pubky URI to a composite ID format.
 * Uses the shared buildCompositeIdFromPubkyUri utility.
 * URI format: pubky://userId/pub/pubky.app/posts/postId
 * Composite format: userId:postId
 */
export function pubkyUriToCompositeId(uri: string): string | null {
  // If already in composite format (userId:postId), return as is
  if (uri.includes(':') && !uri.startsWith('pubky://')) {
    return uri;
  }

  // Use the shared utility to convert URI to composite ID
  return buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS });
}

/**
 * Format post content as preview text with quotes
 */
export function formatPreviewText(content: string | null | undefined): string | null {
  if (!content) return null;
  const truncated = truncateString(content, 20);
  return `'${truncated}'`;
}

/**
 * Check if notification type has post preview
 */
export function hasPostPreview(notificationType: NotificationType): boolean {
  return [NotificationType.Reply, NotificationType.Mention, NotificationType.Repost, NotificationType.TagPost].includes(
    notificationType,
  );
}
