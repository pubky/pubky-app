'use client';

import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { formatPublicKey } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import type { SearchRecentUserItemProps } from './SearchRecentUserItem.types';

/**
 * SearchRecentUserItem
 *
 * Displays a single recent user search item.
 * Shows user avatar, name, and pubky.
 */
export function SearchRecentUserItem({ user, onClick }: SearchRecentUserItemProps) {
  const { userDetails } = useUserDetails(user.id);
  const avatarUrl = useAvatarUrl(userDetails);

  const handleClick = () => {
    onClick(user.id);
  };

  return (
    <Container
      overrideDefaults
      className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md transition-colors hover:bg-secondary"
      onClick={handleClick}
      data-testid={`recent-user-${user.id}`}
      role="button"
      aria-label={`View profile for ${userDetails?.name || user.id}`}
    >
      <AvatarWithFallback
        avatarUrl={avatarUrl}
        name={userDetails?.name || ''}
        fallbackSeed={user.id}
        size="default"
        className="shrink-0"
      />
      <Container overrideDefaults className="min-w-0 flex-1 flex-col items-start">
        <Typography
          className="block max-w-full truncate text-sm font-bold text-foreground"
          overrideDefaults
          data-testid="user-name"
        >
          {userDetails?.name || 'Unknown User'}
        </Typography>
        <Typography
          as="span"
          className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground uppercase"
          overrideDefaults
          data-testid="user-pubky"
        >
          {formatPublicKey({ key: user.id })}
        </Typography>
      </Container>
    </Container>
  );
}
