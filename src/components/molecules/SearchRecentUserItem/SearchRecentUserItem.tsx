'use client';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';
import type { SearchRecentUserItemProps } from './SearchRecentUserItem.types';

/**
 * SearchRecentUserItem
 *
 * Displays a single recent user search item.
 * Shows user avatar, name, and pubky.
 */
export function SearchRecentUserItem({ user, onClick }: SearchRecentUserItemProps) {
  const { userDetails } = Hooks.useUserDetails(user.id);
  const avatarUrl = Hooks.useAvatarUrl(userDetails);

  const handleClick = () => {
    onClick(user.id);
  };

  return (
    <Atoms.Container
      overrideDefaults
      className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md transition-colors hover:bg-secondary"
      onClick={handleClick}
      data-testid={`recent-user-${user.id}`}
      role="button"
      aria-label={`View profile for ${userDetails?.name || user.id}`}
    >
      <Organisms.AvatarWithFallback
        avatarUrl={avatarUrl}
        name={userDetails?.name || ''}
        fallbackSeed={user.id}
        size="default"
        className="shrink-0"
      />
      <Atoms.Container overrideDefaults className="min-w-0 flex-1 flex-col items-start">
        <Atoms.Typography
          className="block max-w-full truncate text-sm font-bold text-foreground"
          overrideDefaults
          data-testid="user-name"
        >
          {userDetails?.name || 'Unknown User'}
        </Atoms.Typography>
        <Atoms.Typography
          as="span"
          className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground uppercase"
          overrideDefaults
          data-testid="user-pubky"
        >
          {Libs.formatPublicKey({ key: user.id })}
        </Atoms.Typography>
      </Atoms.Container>
    </Atoms.Container>
  );
}
