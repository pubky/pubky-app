'use client';

import { useRouter } from 'next/navigation';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import type { PostHeaderUserInfoPopoverHeaderProps } from './PostHeaderUserInfoPopoverHeader.types';

export function PostHeaderUserInfoPopoverHeader({
  userId,
  userName,
  formattedPublicKey,
  avatarUrl,
}: PostHeaderUserInfoPopoverHeaderProps) {
  const router = useRouter();
  const profileUrl = `/profile/${userId}`;

  // Navigate to profile programmatically while preventing event propagation
  // This prevents clicks from bubbling up to PostMain's onClick handler
  const handleProfileNavigation = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(profileUrl);
  };

  return (
    <Atoms.Container className="flex min-w-0 items-center gap-2" overrideDefaults>
      <Atoms.Link href={profileUrl} onClick={handleProfileNavigation} className="shrink-0" overrideDefaults>
        <Organisms.AvatarWithFallback avatarUrl={avatarUrl} name={userName} fallbackSeed={userId} size="md" />
      </Atoms.Link>
      <Atoms.Container className="min-w-0 flex-1 items-start overflow-hidden">
        <Atoms.Link href={profileUrl} onClick={handleProfileNavigation} overrideDefaults>
          <Atoms.Typography
            className="max-w-full cursor-pointer truncate text-sm leading-5 font-bold text-foreground"
            overrideDefaults
          >
            {userName}
          </Atoms.Typography>
        </Atoms.Link>
        <Atoms.Typography
          className="text-xs leading-4 font-medium tracking-[1.2px] text-muted-foreground uppercase"
          overrideDefaults
        >
          {formattedPublicKey}
        </Atoms.Typography>
      </Atoms.Container>
    </Atoms.Container>
  );
}
