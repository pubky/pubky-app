'use client';

import Link from 'next/link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useNotificationPostContent } from '@/hooks/useNotificationPostContent/useNotificationPostContent';
import type { FlatNotification } from '@/models/notification/notification.types';
import {
  getNotificationLink,
  getPostUriFromNotification,
  pubkyUriToCompositeId,
} from '../NotificationItem/NotificationItem.utils';
import { formatGroupedPostTitle } from './NotificationGroupItem.utils';

interface NotificationGroupPostTitleProps {
  notification: FlatNotification;
}

/**
 * One edited post inside a grouped notification row: its title, linking to the post.
 *
 * Each title owns its own fetch, so collapsing the group also collapses the request
 * count — only the titles actually rendered are resolved.
 */
export function NotificationGroupPostTitle({ notification }: NotificationGroupPostTitleProps) {
  const postUri = getPostUriFromNotification(notification);
  const compositeId = postUri ? pubkyUriToCompositeId(postUri) : null;

  const { content, isDeleted, isMissing, isResolving } = useNotificationPostContent({
    compositeId,
    notifyOnCollectionParseError: false,
  });
  const { notificationLink } = getNotificationLink(notification);

  if (isResolving) {
    return (
      <div data-cy="notification-group-item">
        <Skeleton className="h-4 w-48 max-w-full" />
      </div>
    );
  }

  // A member deleted after its edits has no destination and no title — state the notice
  // plainly instead of dressing it up as a quoted, truncated, clickable title.
  if (isDeleted) {
    return (
      <div data-cy="notification-group-item" className="min-w-0">
        <Typography as="p" className="block truncate text-sm font-medium text-muted-foreground lg:text-base">
          {content}
        </Typography>
      </div>
    );
  }

  // A post that never resolves still gets a row, so the header count, the pill count and
  // the rendered rows always agree. A missing post drops its link (the destination shows
  // nothing); an existing post whose label merely failed to derive keeps it.
  const title = content ? formatGroupedPostTitle(content) : 'Untitled post';
  const link = isMissing ? null : notificationLink;

  return (
    <div data-cy="notification-group-item" className="min-w-0">
      {link ? (
        <Link
          href={link}
          className="block truncate text-sm font-medium text-muted-foreground hover:underline lg:text-base"
        >
          {title}
        </Link>
      ) : (
        <Typography as="p" className="block truncate text-sm font-medium text-muted-foreground lg:text-base">
          {title}
        </Typography>
      )}
    </div>
  );
}
