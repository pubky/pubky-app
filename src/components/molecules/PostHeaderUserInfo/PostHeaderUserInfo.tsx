'use client';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { PostHeaderTimestamp } from '../PostHeaderTimestamp/PostHeaderTimestamp';
import { UserInfoPopover } from '../UserInfoPopover/UserInfoPopover';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

import { cn, formatPublicKey } from '@/libs/utils/utils';

interface PostHeaderUserInfoProps {
  userId: string;
  userName: string;
  avatarUrl?: string;
  characterLimit?: {
    count: number;
    max: number;
  };
  showPopover?: boolean;
  size?: 'normal' | 'large';
  timeAgo?: string | null;
  indexedAt?: Date | null;
}

export function PostHeaderUserInfo({
  userId,
  userName,
  avatarUrl,
  characterLimit,
  showPopover = true,
  size = 'normal',
  timeAgo,
  indexedAt,
}: PostHeaderUserInfoProps) {
  const formattedPublicKey = formatPublicKey({ key: userId });
  const profileUrl = `/profile/${userId}`;

  // Prevent click from bubbling to parent post card (which navigates to post)
  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const content = (
    <Container overrideDefaults className={cn('flex min-w-0 items-center', size === 'large' ? 'gap-4' : 'gap-3')}>
      <Link href={profileUrl} onClick={handleLinkClick} className="shrink-0">
        <AvatarWithFallback
          avatarUrl={avatarUrl}
          name={userName}
          fallbackSeed={userId}
          size={size === 'large' ? 'xl' : 'default'}
        />
      </Link>
      <Container overrideDefaults className="min-w-0 flex-1">
        <Link href={profileUrl} onClick={handleLinkClick}>
          <Typography
            className={cn(
              'block max-w-full cursor-pointer truncate font-bold text-foreground',
              size === 'large' ? 'text-2xl leading-8' : 'text-base leading-5',
            )}
            overrideDefaults
          >
            {userName}
          </Typography>
        </Link>
        <Container overrideDefaults className="flex min-w-0 flex-wrap items-center gap-2">
          <Typography
            className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground uppercase"
            overrideDefaults
          >
            {formattedPublicKey}
          </Typography>
          {characterLimit && (
            <Typography
              data-cy="post-header-character-count"
              className="shrink-0 text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground tabular-nums sm:hidden"
              overrideDefaults
            >
              {characterLimit.count}/{characterLimit.max}
            </Typography>
          )}
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
