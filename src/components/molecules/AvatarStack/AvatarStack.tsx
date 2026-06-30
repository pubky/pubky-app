'use client';

import { Container } from '@/atoms/Container/Container';
import { COLLECTIONS_SECTION_AVATAR_STACK_MAX } from '@/config/collections';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import type { AvatarStackProps } from './AvatarStack.types';

export type { AvatarStackProps };

/**
 * AvatarStack
 *
 * Renders an overlapping group of avatars resolved from pubkys, with a `+N`
 * overflow chip for the remainder. Each slot resolves its own profile via
 * `useUserProfile(pubky)` so the stack stays live-reactive without a parent
 * batch fetch.
 *
 * Presentational only — callers supply an already-ordered, already-deduped
 * pubky list (typically derived from the unique authors of visible
 * collection cards in a section).
 */
export function AvatarStack({
  pubkys,
  max = COLLECTIONS_SECTION_AVATAR_STACK_MAX,
  size = 'md',
  className,
  'data-testid': dataTestId,
}: AvatarStackProps) {
  if (pubkys.length === 0) {
    return null;
  }

  const visible = pubkys.slice(0, max);
  const overflow = Math.max(0, pubkys.length - max);

  return (
    <Container
      overrideDefaults
      className={cn('flex items-center', className)}
      data-testid={dataTestId ?? 'avatar-stack'}
    >
      {visible.map((pubky, index) => (
        <AvatarStackSlot key={pubky} pubky={pubky} size={size} offset={index > 0} />
      ))}
      {overflow > 0 && (
        <Container
          overrideDefaults
          className={cn(
            'z-10 flex shrink-0 items-center justify-center rounded-full border border-muted-foreground bg-background text-xs font-medium text-foreground shadow-sm',
            // Match the overlap behaviour of the slot
            visible.length > 0 && '-ml-2',
            sizeToChipClass(size),
          )}
          data-testid="avatar-stack-overflow"
        >
          +{overflow}
        </Container>
      )}
    </Container>
  );
}

interface AvatarStackSlotProps {
  pubky: Pubky;
  size: NonNullable<AvatarStackProps['size']>;
  offset: boolean;
}

function AvatarStackSlot({ pubky, size, offset }: AvatarStackSlotProps) {
  const { profile } = useUserProfile(pubky);
  const name = profile?.name?.trim() || formatPublicKey({ key: pubky });

  return (
    <AvatarWithFallback
      avatarUrl={profile?.avatarUrl}
      name={name}
      fallbackSeed={pubky}
      size={size}
      className={cn('shrink-0 ring-2 ring-background', offset && '-ml-2')}
      alt={name}
    />
  );
}

/**
 * Tailwind size classes for the `+N` chip — match the avatar slot size so
 * the chip lines up visually with the avatars.
 */
function sizeToChipClass(size: NonNullable<AvatarStackProps['size']>): string {
  switch (size) {
    case 'sm':
      return 'size-6';
    case 'md':
      return 'size-8';
    case 'lg':
      return 'size-12';
    case 'xl':
      return 'size-16';
    case 'default':
    default:
      return 'size-10';
  }
}
