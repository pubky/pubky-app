'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useNotificationPostContent } from '@/hooks/useNotificationPostContent/useNotificationPostContent';
import { buildSearchUrl } from '@/hooks/useTagSearch/useTagSearch.utils';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { NotificationType } from '@/models/notification/notification.types';
import {
  NotificationActorAvatar,
  NotificationActorHeading,
  NotificationTimestampAndIcon,
} from '@/molecules/NotificationRowChrome/NotificationRowChrome';
import { PostTag } from '@/molecules/PostTag/PostTag';
import type { NotificationItemProps } from './NotificationItem.types';
import {
  formatPreviewText,
  getNotificationActionText,
  getNotificationLink,
  getPostUriFromNotification,
  getUserIdFromNotification,
  hasPostPreview,
  pubkyUriToCompositeId,
} from './NotificationItem.utils';

export function NotificationItem({ notification, isUnread, isMobile = false }: NotificationItemProps) {
  const router = useRouter();

  // Extract the user ID from the notification (the actor who triggered it)
  const actorUserId = getUserIdFromNotification(notification);
  const postKind = 'post_kind' in notification ? notification.post_kind : undefined;
  const showsPostPreview = hasPostPreview(notification.type, postKind);

  // Types that never render a preview stay null so they do not trigger a pointless fetch.
  const postUri = showsPostPreview ? getPostUriFromNotification(notification) : null;
  const postCompositeId = postUri ? pubkyUriToCompositeId(postUri) : null;

  // Use existing hook for user profile data
  const { profile } = useUserProfile(actorUserId || '');

  const { content: postContent } = useNotificationPostContent({ compositeId: postCompositeId });

  // Get user name and avatar from profile hook
  const userName = profile?.name || 'User';
  const avatarUrl = profile?.avatarUrl;

  // Get notification action text (without username, for separate rendering)
  const actionText = getNotificationActionText(notification);

  // Get post preview text
  const previewText = showsPostPreview ? formatPreviewText(postContent) : null;

  const timestampDate = new Date(notification.timestamp);

  // Calculate notification links (business logic separated in pure function)
  const { notificationLink, userProfileLink } = getNotificationLink(notification);

  // Handle tag click - navigate to search with the tag
  const handleTagClick = (tagLabel: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const normalizedTag = tagLabel.trim().toLowerCase();
    router.push(buildSearchUrl([normalizedTag]));
  };

  // Handle clicking empty space in the notification row - navigate to the main notification target
  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    if (notificationLink) {
      router.push(notificationLink);
    }
  };

  return (
    <Container
      overrideDefaults={true}
      className={`flex w-full min-w-0 items-center justify-between gap-2 ${notificationLink ? 'cursor-pointer' : ''}`}
      onClick={handleRowClick}
    >
      <Container overrideDefaults={true} className="flex min-w-0 flex-1 items-center gap-2">
        <NotificationActorAvatar
          avatarUrl={avatarUrl}
          userName={userName}
          fallbackSeed={actorUserId || userName}
          userProfileLink={userProfileLink}
        />

        <Container overrideDefaults={true} className="flex min-w-0 flex-1 items-center gap-2">
          <NotificationActorHeading
            userName={userName}
            userProfileLink={userProfileLink}
            actionText={actionText}
            actionLink={notificationLink}
          />

          {/* Post preview text - dynamically fetched from database */}
          {previewText &&
            (notificationLink ? (
              <Link
                href={notificationLink}
                className="hidden min-w-0 truncate text-sm font-medium text-muted-foreground hover:underline sm:block lg:text-base"
              >
                {previewText}
              </Link>
            ) : (
              <Typography
                as="p"
                className="hidden min-w-0 truncate text-sm font-medium text-muted-foreground sm:block lg:text-base"
              >
                {previewText}
              </Typography>
            ))}

          {/* Desktop tag badge for tagged notifications - click navigates to search */}
          {(notification.type === NotificationType.TagPost || notification.type === NotificationType.TagProfile) &&
            'tag_label' in notification && (
              <PostTag
                label={notification.tag_label}
                showClose={false}
                className="hidden shrink-0 lg:inline-flex"
                onClick={handleTagClick(notification.tag_label)}
              />
            )}

          {/* Friend notification extra text */}
          {notification.type === NotificationType.NewFriend && (
            <Typography as="p" className="hidden shrink-0 text-base font-medium text-muted-foreground xl:inline">
              {'(you follow each other)'}
            </Typography>
          )}
        </Container>
      </Container>

      {/* Timestamp and icon - links to notification target */}
      <NotificationTimestampAndIcon
        timestampDate={timestampDate}
        isMobile={isMobile}
        type={notification.type}
        postKind={postKind}
        showBadge={isUnread}
        link={notificationLink}
      />
    </Container>
  );
}
