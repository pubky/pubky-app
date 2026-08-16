import { APP_ROUTES, getCollectionRoute, POST_ROUTES, PROFILE_ROUTES } from '@/app/routes';
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
 * Action text for each notification type (rendered after the actor's username)
 */
const NOTIFICATION_ACTION_TEXT: Record<NotificationType, string> = {
  [NotificationType.Follow]: 'followed you',
  [NotificationType.NewFriend]: 'is now your friend',
  [NotificationType.TagPost]: 'tagged your post',
  [NotificationType.TagProfile]: 'tagged your profile',
  [NotificationType.Reply]: 'replied to your post',
  [NotificationType.Repost]: 'reposted your post',
  [NotificationType.Mention]: 'mentioned you in post',
  [NotificationType.PostDeleted]: 'deleted a post',
  [NotificationType.PostEdited]: 'edited a post you have interacted with',
};

type SpecificPostKind = 'collection' | 'long';
type KindSpecificNotificationAction = Partial<Record<NotificationType, Record<SpecificPostKind, string>>>;

const KIND_SPECIFIC_NOTIFICATION_ACTION_TEXT: KindSpecificNotificationAction = {
  [NotificationType.TagPost]: { collection: 'tagged your collection', long: 'tagged your article' },
  [NotificationType.Reply]: { collection: 'replied to your collection', long: 'replied to your article' },
  [NotificationType.Repost]: { collection: 'reposted your collection', long: 'reposted your article' },
  [NotificationType.Mention]: { collection: 'mentioned you in a collection', long: 'mentioned you in an article' },
  [NotificationType.PostDeleted]: { collection: 'deleted a collection', long: 'deleted an article' },
  [NotificationType.PostEdited]: { collection: 'updated collection', long: 'updated an article' },
};

/**
 * Get notification action text (without the username) based on type
 */
export function getNotificationActionText(notification: FlatNotification): string {
  if ('post_kind' in notification) {
    const postKind = notification.post_kind;
    if (postKind === 'collection' || postKind === 'long') {
      const actionText = KIND_SPECIFIC_NOTIFICATION_ACTION_TEXT[notification.type]?.[postKind];
      if (actionText) return actionText;
    }
  }

  return NOTIFICATION_ACTION_TEXT[notification.type] ?? 'New notification';
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
 * Convert a pubky URI or composite ID to collection/post route parameters.
 * Uses shared composite ID utilities.
 * Supports:
 * - pubky:// URI format: pubky://userId/pub/pubky.app/posts/postId
 * - Composite ID format: userId:postId
 */
function uriToRouteParams(uri: string | undefined): { authorPubky: string; postId: string } | null {
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
    // Parse the composite ID to get route parameters
    const { pubky, id } = parseCompositeId(compositeId);
    return { authorPubky: pubky, postId: id };
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
  let targetIsSubject = false;

  switch (notification.type) {
    case NotificationType.Reply:
      // Navigate to parent post so user sees the full thread with the reply in context
      uri = notification.parent_post_uri;
      targetIsSubject = true;
      break;

    case NotificationType.Mention:
      uri = notification.post_uri;
      targetIsSubject = true;
      break;

    case NotificationType.TagPost:
      uri = notification.post_uri;
      targetIsSubject = true;
      break;

    case NotificationType.Repost:
      uri = notification.repost_uri;
      break;

    case NotificationType.PostDeleted:
      uri = notification.linked_uri;
      break;

    case NotificationType.PostEdited:
      uri = notification.edited_uri;
      targetIsSubject = true;
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

  const routeParams = uriToRouteParams(uri);
  if (!routeParams) return null;

  if (targetIsSubject && 'post_kind' in notification && notification.post_kind === 'collection') {
    return getCollectionRoute(routeParams.authorPubky, routeParams.postId);
  }

  return `${POST_ROUTES.POST}/${routeParams.authorPubky}/${routeParams.postId}`;
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
export function hasPostPreview(notificationType: NotificationType, postKind?: string): boolean {
  if (notificationType === NotificationType.PostEdited) return postKind === 'collection';

  return [NotificationType.Reply, NotificationType.Mention, NotificationType.Repost, NotificationType.TagPost].includes(
    notificationType,
  );
}
