'use client';

import type { AvatarSize } from '@/atoms/Avatar/Avatar.variants';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

interface HeroOwnerProps {
  name: string;
  fallbackSeed: string;
  avatarUrl?: string;
  /**
   * Whether the owner profile has resolved. While `false` the name is replaced
   * by a skeleton so the hero doesn't flash an unresolved fallback (e.g. the "U"
   * default or the raw pubky) before the profile loads.
   */
  isResolved: boolean;
  size: AvatarSize;
  className?: string;
}

/**
 * HeroOwner
 *
 * Avatar + owner-name row shared by `BookmarksHero` and `CollectionHero`. Keeps
 * the gated name / skeleton transition identical across the collections-pattern
 * heroes so they can't drift. Callers tune the avatar `size` and the row `gap`
 * (via `className`) to match their layout.
 */
export function HeroOwner({ name, fallbackSeed, avatarUrl, isResolved, size, className }: HeroOwnerProps) {
  return (
    <Container overrideDefaults className={cn('flex min-w-0 items-center gap-3', className)}>
      <AvatarWithFallback avatarUrl={avatarUrl} name={name} fallbackSeed={fallbackSeed} size={size} alt={name} />
      {isResolved ? (
        <Typography as="span" overrideDefaults className="min-w-0 truncate text-xl leading-7 font-bold text-foreground">
          {name}
        </Typography>
      ) : (
        <Skeleton className="h-5 w-32 rounded-md" />
      )}
    </Container>
  );
}
