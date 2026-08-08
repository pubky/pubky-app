'use client';

import { getUserProfileUrl } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
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
  const formattedPublicKey = formatPublicKey({ key: userId });
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

  const userNameContent = (
    <Link href={profileUrl} onClick={handleLinkClick} className="block w-full max-w-full min-w-0 overflow-hidden">
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

  // This container is also the UserInfoPopover hover target, so it must hug the avatar and
  // name instead of stretching across the header row — otherwise the empty space next to the
  // timestamp opens the popover. `max-w-full` keeps long names truncating inside tight layouts.
  const content = (
    <Container
      overrideDefaults
      className={cn(
        'grid w-full max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center',
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
