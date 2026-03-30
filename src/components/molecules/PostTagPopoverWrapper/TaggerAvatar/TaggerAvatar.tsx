'use client';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import type { TaggerAvatarProps } from '../PostTagPopoverWrapper.types';
import { UserInfoPopover } from '../../UserInfoPopover';

/**
 * TaggerAvatar
 *
 * Individual tagger avatar with click-to-open profile popover.
 */
function TaggerAvatar({ tagger, index }: TaggerAvatarProps) {
  // Index-based z-index so overlapping avatars (-ml-2) stack correctly: first avatar on top,
  // later ones behind. Use low relative values (z-[1]–z-[4]) since avatars are inside popover (z-50)
  // and don't need global scale (z-40 = nav, z-30 = floating, etc. per z-index.mdc).
  const zIndexClass = (['z-[4]', 'z-[3]', 'z-[2]', 'z-[1]'] as const)[index] ?? 'z-[1]';

  return (
    <UserInfoPopover
      userId={tagger.id}
      userName={tagger.name ?? ''}
      avatarUrl={tagger.avatarUrl}
      formattedPublicKey={Libs.formatPublicKey({ key: tagger.id })}
      hover={false}
      sideOffset={8}
      alignOffset={0}
    >
      <Atoms.Button
        overrideDefaults
        className={Libs.cn(
          'cursor-pointer rounded-full transition-opacity hover:opacity-80',
          index === 0 ? 'ml-0' : '-ml-2',
          zIndexClass,
        )}
      >
        <Organisms.AvatarWithFallback
          name={tagger.name ?? tagger.id}
          avatarUrl={tagger.avatarUrl}
          fallbackSeed={tagger.id}
          size="md"
          className="shrink-0 border-2 border-background shadow-sm"
        />
      </Atoms.Button>
    </UserInfoPopover>
  );
}

export { TaggerAvatar };
