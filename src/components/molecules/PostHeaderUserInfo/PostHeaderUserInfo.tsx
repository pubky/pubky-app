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
  /**
   * When `false`, the avatar and name render as text instead of profile links.
   * The quoted post in the Reply/Repost dialogs passes `false` so a tap cannot
   * change the route behind the open modal. Defaults to `true`.
   */
  navigable?: boolean;
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
  navigable = true,
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

  const avatarClassName = cn('shrink-0', visuallyHideAvatar && 'pointer-events-none invisible');
  const avatarImage = (
    <AvatarWithFallback
      avatarUrl={avatarUrl}
      name={userName}
      fallbackSeed={userId}
      size={AVATAR_SIZE_BY_HEADER_SIZE[size]}
    />
  );

  // Non-navigating previews keep the same layout boxes around the avatar and name
  // but drop the profile links, so nothing here can change the route behind a modal.
  const avatar = navigable ? (
    <Link
      href={profileUrl}
      onClick={handleLinkClick}
      className={avatarClassName}
      aria-hidden={visuallyHideAvatar || undefined}
      tabIndex={visuallyHideAvatar ? -1 : undefined}
    >
      {avatarImage}
    </Link>
  ) : (
    <Container overrideDefaults className={avatarClassName} aria-hidden={visuallyHideAvatar || undefined}>
      {avatarImage}
    </Container>
  );

  if (!showUserInfo) {
    return avatar;
  }

  const characterLimitContent = characterLimit && (
    <Typography
      data-cy="post-header-character-count"
      className={cn(
        'shrink-0 text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap tabular-nums',
        // At the limit the counter turns red: the composer stops accepting input there, so the
        // counter is the only thing telling the user why (issue #1761).
        characterLimit.count >= characterLimit.max ? 'text-destructive' : 'text-muted-foreground',
      )}
      overrideDefaults
    >
      {characterLimit.count}/{characterLimit.max}
    </Typography>
  );

  const userNameClassName = 'block w-fit max-w-full min-w-0 overflow-hidden';
  const userNameText = (
    <Typography
      className={cn(
        'block w-full max-w-full truncate font-bold text-foreground',
        navigable && 'cursor-pointer',
        USERNAME_CLASS_BY_HEADER_SIZE[size],
      )}
      overrideDefaults
    >
      {userName}
    </Typography>
  );
  const userNameLink = navigable ? (
    <Link href={profileUrl} onClick={handleLinkClick} className={userNameClassName}>
      {userNameText}
    </Link>
  ) : (
    <Container overrideDefaults className={userNameClassName}>
      {userNameText}
    </Container>
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
          <TooltipContent variant="accent">{parsedStatus.text}</TooltipContent>
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

  // The popover carries its own profile link and Follow action, so a non-navigating
  // header skips it too.
  if (!showPopover || !navigable) {
    return content;
  }

  return (
    <UserInfoPopover userId={userId} userName={userName} avatarUrl={avatarUrl} formattedPublicKey={formattedPublicKey}>
      {content}
    </UserInfoPopover>
  );
}
