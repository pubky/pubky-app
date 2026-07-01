'use client';

import type { AvatarSize } from '@/atoms/Avatar/Avatar.variants';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';

interface AvatarStackSkeletonProps {
  /** Number of skeleton avatar slots to render. */
  count: number;
  /** Avatar size; matches `AvatarStack` / `AvatarWithFallback`. */
  size?: AvatarSize;
  className?: string;
  'data-testid'?: string;
}

/**
 * Skeleton placeholder for `AvatarStack`. Renders `count` overlapping round
 * skeleton dots sized to match the real stack, so section headers don't
 * shift horizontally when avatars resolve. Also used as a single-circle
 * placeholder (count=1) for sections that show a single avatar in their
 * header (e.g. `MyCollections`).
 */
export function AvatarStackSkeleton({
  count,
  size = 'md',
  className,
  'data-testid': dataTestId,
}: AvatarStackSkeletonProps) {
  if (count <= 0) return null;

  const sizeClass = sizeToSkeletonClass(size);

  return (
    <Container
      overrideDefaults
      className={cn('flex items-center', className)}
      data-testid={dataTestId ?? 'avatar-stack-skeleton'}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={`avatar-stack-skeleton-${index}`}
          className={cn('shrink-0 rounded-full ring-2 ring-background', sizeClass, index > 0 && '-ml-2')}
        />
      ))}
    </Container>
  );
}

function sizeToSkeletonClass(size: AvatarSize): string {
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
