'use client';

import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import type { ArticleJSON } from '@/hooks/usePostArticle/usePostArticle.types';
import { buildSearchUrl } from '@/hooks/useTagSearch/useTagSearch.utils';
import { resolvePubkyToNames } from './NotificationItem.helpers';
import type { NotificationItemProps } from './NotificationItem.types';
import { Logger } from '@/libs/logger/logger';
import { formatNotificationTime, isPostDeleted } from '@/libs/utils/utils';

import {
  getNotificationLink,
  getUserIdFromNotification,
  getNotificationActionKey,
  getPostUriFromNotification,
  pubkyUriToCompositeId,
  formatPreviewText,
  hasPostPreview,
} from './NotificationItem.utils';
import { PostController } from '@/controllers/post/post';
import { NotificationType } from '@/models/notification/notification.types';
import { useAuthStore } from '@/stores/auth/auth.store';
export function NotificationItem({ notification, isUnread }: NotificationItemProps) {
  const t = useTranslations('notifications.actions');
  const tCommon = useTranslations('common');
  const tProfile = useTranslations('profile');
  const tToast = useTranslations('toast');
  const tPostToast = useTranslations('toast.post');
  const tPost = useTranslations('post');
  const router = useRouter();
  const { toast } = Molecules.useToast();

  // Extract the user ID from the notification (the actor who triggered it)
  const actorUserId = getUserIdFromNotification(notification);

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
            try {
              const parsed = JSON.parse(post.content) as ArticleJSON;
              setPostContent(parsed.title || '');
            } catch {
              setPostContent(post.content);
              toast({
                title: tToast('error'),
                description: tPostToast('parseError'),
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
  const previewText = hasPostPreview(notification.type) ? formatPreviewText(postContent) : null;

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
    <Atoms.Container
      overrideDefaults={true}
      className={`flex w-full min-w-0 items-center justify-between gap-2 ${notificationLink ? 'cursor-pointer' : ''}`}
      onClick={handleRowClick}
    >
      <Atoms.Container overrideDefaults={true} className="flex min-w-0 flex-1 items-center gap-2">
        {/* Avatar - links to user profile */}
        {userProfileLink ? (
          <Link href={userProfileLink} className="shrink-0 transition-opacity hover:opacity-80">
            <Organisms.AvatarWithFallback
              avatarUrl={avatarUrl}
              name={userName}
              fallbackSeed={actorUserId || userName}
              size="sm"
              className="lg:size-8"
            />
          </Link>
        ) : (
          <Organisms.AvatarWithFallback
            avatarUrl={avatarUrl}
            name={userName}
            fallbackSeed={actorUserId || userName}
            size="sm"
            className="shrink-0 lg:size-8"
          />
        )}

        <Atoms.Container overrideDefaults={true} className="flex min-w-0 flex-1 items-center gap-2">
          <Atoms.Typography
            as="p"
            className="min-w-0 shrink truncate text-sm leading-none font-medium text-foreground lg:text-base lg:leading-normal"
          >
            {/* Username - links to user profile without underline on hover */}
            {userProfileLink ? (
              <Link href={userProfileLink} className="no-underline hover:no-underline">
                {userName}
              </Link>
            ) : (
              userName
            )}{' '}
            {/* Action text - links to notification target (post or profile) */}
            {notificationLink ? (
              <Link href={notificationLink} className="text-foreground hover:underline">
                {actionText}
              </Link>
            ) : (
              <span className="text-foreground">{actionText}</span>
            )}
          </Atoms.Typography>

          {/* Post preview text for desktop - dynamically fetched from database */}
          {previewText &&
            (notificationLink ? (
              <Link
                href={notificationLink}
                className="hidden shrink-0 text-base font-medium text-muted-foreground hover:underline xl:inline"
              >
                {previewText}
              </Link>
            ) : (
              <Atoms.Typography
                as="p"
                className="hidden shrink-0 text-base font-medium text-muted-foreground xl:inline"
              >
                {previewText}
              </Atoms.Typography>
            ))}

          {/* Tag badge for tagged notifications - click navigates to search */}
          {(notification.type === NotificationType.TagPost || notification.type === NotificationType.TagProfile) &&
            'tag_label' in notification && (
              <Molecules.PostTag
                label={notification.tag_label}
                showClose={false}
                className="shrink-0"
                onClick={handleTagClick(notification.tag_label)}
              />
            )}

          {/* Friend notification extra text */}
          {notification.type === NotificationType.NewFriend && (
            <Atoms.Typography as="p" className="hidden shrink-0 text-base font-medium text-muted-foreground xl:inline">
              {tProfile('friendsWithYou')}
            </Atoms.Typography>
          )}
        </Atoms.Container>
      </Atoms.Container>

      {/* Timestamp and icon - links to notification target */}
      {notificationLink ? (
        <Link href={notificationLink} className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80">
          {/* Short timestamp for mobile and medium screens */}
          <Atoms.Typography
            as="p"
            className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase xl:hidden"
          >
            {timestampShort}
          </Atoms.Typography>
          {/* Long timestamp for large desktop */}
          <Atoms.Typography
            as="p"
            className="hidden text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase xl:block"
          >
            {timestampLong}
          </Atoms.Typography>

          <Molecules.NotificationIcon type={notification.type} showBadge={isUnread} />
        </Link>
      ) : (
        <Atoms.Container overrideDefaults={true} className="flex items-center gap-2">
          {/* Short timestamp for mobile and medium screens */}
          <Atoms.Typography
            as="p"
            className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase xl:hidden"
          >
            {timestampShort}
          </Atoms.Typography>
          {/* Long timestamp for large desktop */}
          <Atoms.Typography
            as="p"
            className="hidden text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase xl:block"
          >
            {timestampLong}
          </Atoms.Typography>

          <Molecules.NotificationIcon type={notification.type} showBadge={isUnread} />
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
