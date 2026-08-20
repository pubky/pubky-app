'use client';

import Link from 'next/link';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { cn } from '@/libs/utils/utils';
import type { NotificationType } from '@/models/notification/notification.types';
import { NotificationIcon } from '@/molecules/NotificationIcon/NotificationIcon';
import { RelativeTimestamp } from '@/molecules/RelativeTimestamp/RelativeTimestamp';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

/**
 * The chrome a notification row shares whether it is a single item or a grouped run:
 * actor avatar, actor heading (username + action text) and the timestamp/icon cluster.
 * Keeping these here stops the single and grouped rows from drifting apart visually.
 */

interface NotificationActorAvatarProps {
  avatarUrl?: string;
  userName: string;
  fallbackSeed: string;
  /** Wraps the avatar in a profile link when present. */
  userProfileLink: string | null;
}

export function NotificationActorAvatar({
  avatarUrl,
  userName,
  fallbackSeed,
  userProfileLink,
}: NotificationActorAvatarProps) {
  if (userProfileLink) {
    return (
      <Link href={userProfileLink} className="shrink-0 transition-opacity hover:opacity-80">
        <AvatarWithFallback
          avatarUrl={avatarUrl}
          name={userName}
          fallbackSeed={fallbackSeed}
          size="sm"
          className="lg:size-8"
        />
      </Link>
    );
  }

  return (
    <AvatarWithFallback
      avatarUrl={avatarUrl}
      name={userName}
      fallbackSeed={fallbackSeed}
      size="sm"
      className="shrink-0 lg:size-8"
    />
  );
}

interface NotificationActorHeadingProps {
  userName: string;
  /** Makes the username a profile link when present. */
  userProfileLink: string | null;
  actionText: string;
  /** Makes the action text a link to the notification target when present. */
  actionLink?: string | null;
}

export function NotificationActorHeading({
  userName,
  userProfileLink,
  actionText,
  actionLink,
}: NotificationActorHeadingProps) {
  return (
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
      {/* Action text - links to the notification target when there is one */}
      {actionLink ? (
        <Link href={actionLink} className="text-foreground hover:underline lg:shrink-0">
          {actionText}
        </Link>
      ) : (
        <span className="text-foreground lg:shrink-0">{actionText}</span>
      )}
    </Typography>
  );
}

interface NotificationTimestampAndIconProps {
  timestampDate: Date;
  isMobile: boolean;
  type: NotificationType;
  postKind?: string;
  showBadge: boolean;
  /** Wraps the cluster in a link to the notification target when present. */
  link?: string | null;
  /** Extra classes for the non-link wrapper. */
  className?: string;
}

export function NotificationTimestampAndIcon({
  timestampDate,
  isMobile,
  type,
  postKind,
  showBadge,
  link,
  className,
}: NotificationTimestampAndIconProps) {
  const { formatRelativeTime } = useRelativeTime();

  const content = (
    <>
      <RelativeTimestamp
        timeAgo={formatRelativeTime(timestampDate)}
        date={timestampDate}
        isMobile={isMobile}
        className="text-xs font-medium tracking-widest text-muted-foreground"
      />

      <NotificationIcon type={type} postKind={postKind} showBadge={showBadge} />
    </>
  );

  if (link) {
    return (
      <Link href={link} className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80">
        {content}
      </Link>
    );
  }

  return (
    <Container overrideDefaults={true} className={cn('flex items-center gap-2', className)}>
      {content}
    </Container>
  );
}
