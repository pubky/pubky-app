'use client';

import type { AvatarSize } from '@/atoms/Avatar/Avatar.variants';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
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
  /** When set, the avatar (and name once resolved) link to the owner's profile. */
  profileHref?: string;
}

/**
 * HeroOwner
 *
 * Avatar + owner-name row shared by `BookmarksHero` and `CollectionHero`. Keeps
 * the gated name / skeleton transition identical across the collections-pattern
 * heroes so they can't drift. Callers tune the avatar `size` and the row `gap`
 * (via `className`) to match their layout.
 */
export function HeroOwner({ name, fallbackSeed, avatarUrl, isResolved, size, className, profileHref }: HeroOwnerProps) {
  const avatar = (
    <AvatarWithFallback avatarUrl={avatarUrl} name={name} fallbackSeed={fallbackSeed} size={size} alt={name} />
  );

  const nameContent = isResolved ? (
    <Typography as="span" overrideDefaults className="min-w-0 truncate text-xl leading-7 font-bold text-foreground">
      {name}
    </Typography>
  ) : (
    <Skeleton className="h-5 w-32 rounded-md" />
  );

  return (
    <Container overrideDefaults className={cn('flex min-w-0 items-center gap-3', className)}>
      {profileHref ? (
        <Link href={profileHref} overrideDefaults className="shrink-0">
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      {profileHref && isResolved ? (
        <Link href={profileHref} overrideDefaults className="block max-w-full min-w-0">
          {nameContent}
        </Link>
      ) : (
        nameContent
      )}
    </Container>
  );
}
