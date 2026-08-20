'use client';

import { useState } from 'react';
import { getUserProfileUrl } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';
import { parseStatus } from '@/libs/status/status';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PostHeaderTimestamp } from '../PostHeaderTimestamp/PostHeaderTimestamp';
import { UserInfoPopover } from '../UserInfoPopover/UserInfoPopover';
import {
  AVATAR_SIZE_BY_HEADER_SIZE,
  GAP_CLASS_BY_HEADER_SIZE,
  type PostHeaderCharacterLimitPlacement,
  type PostHeaderSize,
  USERNAME_CLASS_BY_HEADER_SIZE,
} from './PostHeaderUserInfo.utils';

interface PostHeaderUserInfoProps {
  userId: string;
  userName: string;
  status?: string | null;
  avatarUrl?: string;
  showPopover?: boolean;
  showUserInfo?: boolean;
  visuallyHideAvatar?: boolean;
  size?: PostHeaderSize;
  timeAgo?: string | null;
  indexedAt?: Date | null;
  characterLimit?: {
    count: number;
    max: number;
  };
  characterLimitPlacement?: PostHeaderCharacterLimitPlacement;
}

export function PostHeaderUserInfo({
  userId,
  userName,
  status,
  avatarUrl,
  showPopover = true,
  showUserInfo = true,
  visuallyHideAvatar = false,
  size = 'normal',
  timeAgo,
  indexedAt,
  characterLimit,
  characterLimitPlacement = 'metadata',
}: PostHeaderUserInfoProps) {
  const [isStatusTooltipOpen, setIsStatusTooltipOpen] = useState(false);
  const formattedPublicKey = formatPublicKey({ key: userId });
  const parsedStatus = parseStatus(status || '');
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const profileUrl = getUserProfileUrl(userId, currentUserPubky);

  // Prevent click from bubbling to parent post card (which navigates to post)
  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const avatar = (
    <Link
      href={profileUrl}
      onClick={handleLinkClick}
      className={cn('shrink-0', visuallyHideAvatar && 'pointer-events-none invisible')}
      aria-hidden={visuallyHideAvatar || undefined}
      tabIndex={visuallyHideAvatar ? -1 : undefined}
    >
      <AvatarWithFallback
        avatarUrl={avatarUrl}
        name={userName}
        fallbackSeed={userId}
        size={AVATAR_SIZE_BY_HEADER_SIZE[size]}
      />
    </Link>
  );

  if (!showUserInfo) {
    return avatar;
  }

  const characterLimitContent = characterLimit && (
    <Typography
      data-cy="post-header-character-count"
      className="shrink-0 text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground tabular-nums"
      overrideDefaults
    >
      {characterLimit.count}/{characterLimit.max}
    </Typography>
  );

  const userNameLink = (
    <Link href={profileUrl} onClick={handleLinkClick} className="block w-fit max-w-full min-w-0 overflow-hidden">
      <Typography
        className={cn(
          'block w-full max-w-full cursor-pointer truncate font-bold text-foreground',
          USERNAME_CLASS_BY_HEADER_SIZE[size],
        )}
        overrideDefaults
      >
        {userName}
      </Typography>
    </Link>
  );

  const userNameContent = parsedStatus.emoji ? (
    <Container overrideDefaults className="flex max-w-full min-w-0 items-center gap-1.5">
      {userNameLink}
      <Tooltip open={isStatusTooltipOpen} onOpenChange={setIsStatusTooltipOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${parsedStatus.text} status`}
            className={cn(
              'shrink-0 rounded-sm border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              USERNAME_CLASS_BY_HEADER_SIZE[size],
            )}
            onPointerDown={(event) => {
              event.stopPropagation();

              if (event.pointerType !== 'touch') return;

              event.preventDefault();
              setIsStatusTooltipOpen((open) => !open);
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {parsedStatus.emoji}
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="bg-accent font-medium text-foreground [&_svg]:fill-accent">
            {parsedStatus.text}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </Container>
  ) : (
    userNameLink
  );

  // This container is also the UserInfoPopover hover target when showPopover is true, so it
  // must hug the avatar and name (`w-fit`) instead of stretching across the header row —
  // otherwise the empty space next to the timestamp opens the popover. Keep `w-full` when the
  // popover is off (composer) so the character count can sit on the trailing edge. `max-w-full`
  // keeps long names truncating inside tight layouts.
  const content = (
    <Container
      overrideDefaults
      className={cn(
        'grid max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center',
        showPopover ? 'w-fit' : 'w-full',
        GAP_CLASS_BY_HEADER_SIZE[size],
      )}
    >
      {avatar}
      <Container overrideDefaults className="max-w-full min-w-0">
        {characterLimitContent && characterLimitPlacement === 'name-row' ? (
          <Container overrideDefaults className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            {userNameContent}
            {characterLimitContent}
          </Container>
        ) : (
          userNameContent
        )}
        <Container overrideDefaults className="flex min-w-0 flex-wrap items-center gap-2">
          <Typography
            className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground uppercase"
            overrideDefaults
          >
            {formattedPublicKey}
          </Typography>
          {characterLimitPlacement === 'metadata' && characterLimitContent}
          {timeAgo && <PostHeaderTimestamp timeAgo={timeAgo} indexedAt={indexedAt} />}
        </Container>
      </Container>
    </Container>
  );

  if (!showPopover) {
    return content;
  }

  return (
    <UserInfoPopover userId={userId} userName={userName} avatarUrl={avatarUrl} formattedPublicKey={formattedPublicKey}>
      {content}
    </UserInfoPopover>
  );
}
