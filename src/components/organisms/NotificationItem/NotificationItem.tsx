'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { PostController } from '@/controllers/post/post';
import { buildSearchUrl } from '@/hooks/useTagSearch/useTagSearch.utils';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { Logger } from '@/libs/logger/logger';
import { parseArticleContent } from '@/libs/post/articleContent';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { formatNotificationTime, isPostDeleted } from '@/libs/utils/utils';
import { NotificationType } from '@/models/notification/notification.types';
import { NotificationIcon } from '@/molecules/NotificationIcon/NotificationIcon';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { resolvePubkyToNames } from './NotificationItem.helpers';
import type { NotificationItemProps } from './NotificationItem.types';
import {
  formatPreviewText,
  getNotificationActionKey,
  getNotificationLink,
  getPostUriFromNotification,
  getUserIdFromNotification,
  hasPostPreview,
  pubkyUriToCompositeId,
} from './NotificationItem.utils';

export function NotificationItem({ notification, isUnread }: NotificationItemProps) {
  const t = useTranslations('notifications.actions');
  const tCommon = useTranslations('common');
  const tProfile = useTranslations('profile');
  const tPostToast = useTranslations('toast.post');
  const tPost = useTranslations('post');
  const router = useRouter();
  const { toast } = useToast();

  // Extract the user ID from the notification (the actor who triggered it)
  const actorUserId = getUserIdFromNotification(notification);
  const postKind = 'post_kind' in notification ? notification.post_kind : undefined;

  // Extract post composite ID for notifications with post content (memoized to avoid recalculation)
  const postCompositeId = useMemo(() => {
    const postUri = getPostUriFromNotification(notification);
    return postUri ? pubkyUriToCompositeId(postUri) : null;
  }, [notification]);

  // State for post content (fetched via controller)
  const [postContent, setPostContent] = useState<string | null>(null);

  // Use existing hook for user profile data
  const { profile } = useUserProfile(actorUserId || '');

  // Fetch post content via controller (handles caching internally)
  useEffect(() => {
    if (!postCompositeId) return;

    const viewerId = useAuthStore.getState().currentUserPubky;
    if (!viewerId) return;

    let isCancelled = false;

    // PostController.getOrFetch handles the caching strategy:
    // 1. Check local DB first
    // 2. If missing, fetch from Nexus
    // 3. Write to local DB
    PostController.getOrFetch({ compositeId: postCompositeId, viewerId })
      .then(async (post) => {
        if (!isCancelled && post?.content) {
          if (isPostDeleted(post.content)) {
            setPostContent(tPost('deleted'));
          } else if (post.kind === 'long') {
            setPostContent(parseArticleContent(post.content)?.title || post.content);
          } else if (post.kind === 'collection') {
            const parsed = parseCollectionContent(post.content);
            if (parsed) {
              setPostContent(parsed.name);
            } else {
              setPostContent(post.content);
              toast({
                variant: 'error',
                description: tPostToast('collectionParseError'),
              });
            }
          } else {
            const content = await resolvePubkyToNames(post.content);
            if (!isCancelled) setPostContent(content);
          }
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          Logger.warn('Failed to fetch notification post:', { postCompositeId, error });
        }
      });

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is an external side-effect, not a dependency
  }, [postCompositeId]);

  // Get user name and avatar from profile hook
  const userName = profile?.name || tCommon('user');
  const avatarUrl = profile?.avatarUrl;

  // Get notification action text (without username, for separate rendering)
  const actionKey = getNotificationActionKey(notification);
  const actionText = t(actionKey);

  // Get post preview text
  const previewText = hasPostPreview(notification.type, postKind) ? formatPreviewText(postContent) : null;

  // Format timestamps (short for mobile, long for desktop)
  const timestampShort = formatNotificationTime(notification.timestamp, false);
  const timestampLong = formatNotificationTime(notification.timestamp, true);

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
        {/* Avatar - links to user profile */}
        {userProfileLink ? (
          <Link href={userProfileLink} className="shrink-0 transition-opacity hover:opacity-80">
            <AvatarWithFallback
              avatarUrl={avatarUrl}
              name={userName}
              fallbackSeed={actorUserId || userName}
              size="sm"
              className="lg:size-8"
            />
          </Link>
        ) : (
          <AvatarWithFallback
            avatarUrl={avatarUrl}
            name={userName}
            fallbackSeed={actorUserId || userName}
            size="sm"
            className="shrink-0 lg:size-8"
          />
        )}

        <Container overrideDefaults={true} className="flex min-w-0 flex-1 items-center gap-2">
          <Typography
            as="p"
            className="min-w-0 shrink text-sm leading-normal font-medium whitespace-normal text-foreground lg:flex lg:items-baseline lg:gap-1 lg:text-base lg:whitespace-nowrap"
          >
            {/* Username - truncated independently so long names do not overlap timestamp/icon */}
            {userProfileLink ? (
              <Link
                href={userProfileLink}
                className="inline-block max-w-full min-w-0 truncate align-bottom no-underline hover:no-underline"
              >
                {userName}
              </Link>
            ) : (
              <span className="inline-block max-w-full min-w-0 truncate align-bottom">{userName}</span>
            )}{' '}
            {/* Action text - links to notification target (post or profile) */}
            {notificationLink ? (
              <Link href={notificationLink} className="text-foreground hover:underline lg:shrink-0">
                {actionText}
              </Link>
            ) : (
              <span className="text-foreground lg:shrink-0">{actionText}</span>
            )}
          </Typography>

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
              {tProfile('friendsWithYou')}
            </Typography>
          )}
        </Container>
      </Container>

      {/* Timestamp and icon - links to notification target */}
      {notificationLink ? (
        <Link href={notificationLink} className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80">
          {/* Short timestamp for mobile and medium screens */}
          <Typography as="p" className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase xl:hidden">
            {timestampShort}
          </Typography>
          {/* Long timestamp for large desktop */}
          <Typography
            as="p"
            className="hidden text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase xl:block"
          >
            {timestampLong}
          </Typography>

          <NotificationIcon type={notification.type} postKind={postKind} showBadge={isUnread} />
        </Link>
      ) : (
        <Container overrideDefaults={true} className="flex items-center gap-2">
          {/* Short timestamp for mobile and medium screens */}
          <Typography as="p" className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase xl:hidden">
            {timestampShort}
          </Typography>
          {/* Long timestamp for large desktop */}
          <Typography
            as="p"
            className="hidden text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase xl:block"
          >
            {timestampLong}
          </Typography>

          <NotificationIcon type={notification.type} postKind={postKind} showBadge={isUnread} />
        </Container>
      )}
    </Container>
  );
}
