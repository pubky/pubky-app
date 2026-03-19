'use client';

import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import type { PostHeaderUserInfoProps } from './PostHeaderUserInfo.types';

export function PostHeaderUserInfo({
  userId,
  userName,
  avatarUrl,
  characterLimit,
  showPopover = true,
  size = 'normal',
  timeAgo,
}: PostHeaderUserInfoProps) {
  const formattedPublicKey = Libs.formatPublicKey({ key: userId });

  const profileUrl = `/profile/${userId}`;

  // Prevent click from bubbling to parent post card (which navigates to post)
  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const content = (
    <Atoms.Container
      overrideDefaults
      className={Libs.cn('flex min-w-0 items-center', size === 'large' ? 'gap-5' : 'gap-3')}
    >
      <Atoms.Link href={profileUrl} onClick={handleLinkClick} className="shrink-0">
        <Organisms.AvatarWithFallback
          avatarUrl={avatarUrl}
          name={userName}
          fallbackSeed={userId}
          size={size === 'large' ? 'xl' : 'default'}
        />
      </Atoms.Link>
      <Atoms.Container overrideDefaults className="min-w-0 flex-1">
        <Atoms.Link href={profileUrl} onClick={handleLinkClick}>
          <Atoms.Typography
            className={Libs.cn(
              'block max-w-full cursor-pointer truncate leading-5 font-bold text-foreground',
              size === 'large' ? 'text-2xl' : 'text-base',
            )}
            overrideDefaults
          >
            {userName}
          </Atoms.Typography>
        </Atoms.Link>
        <Atoms.Container overrideDefaults className="flex min-w-0 flex-wrap items-center gap-2">
          <Atoms.Typography
            className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground uppercase"
            overrideDefaults
          >
            {formattedPublicKey}
          </Atoms.Typography>
          {characterLimit && (
            <Atoms.Typography
              data-cy="post-header-character-count"
              className="shrink-0 text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground"
              overrideDefaults
            >
              {characterLimit.count}/{characterLimit.max}
            </Atoms.Typography>
          )}
          {timeAgo && <Molecules.PostHeaderTimestamp timeAgo={timeAgo} />}
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );

  if (!showPopover) {
    return content;
  }

  return (
    <Molecules.PostHeaderUserInfoPopoverWrapper
      userId={userId}
      userName={userName}
      avatarUrl={avatarUrl}
      formattedPublicKey={formattedPublicKey}
    >
      {content}
    </Molecules.PostHeaderUserInfoPopoverWrapper>
  );
}
