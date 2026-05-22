'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { MAX_OVERFLOW_DISPLAY } from './AvatarGroup.constants';
import type { AvatarGroupProps } from './AvatarGroup.types';

/**
 * AvatarGroup
 *
 * Displays a stack of overlapping avatars with a count indicator for overflow.
 * The overflow number is based on totalCount (e.g., post count, user count),
 * not the number of items in the array.
 *
 * @example
 * ```tsx
 * <AvatarGroup
 *   items={[{ id: '1', name: 'Alice', avatarUrl: '...' }]}
 *   totalCount={100}
 *   maxAvatars={6}
 * />
 * ```
 */
export function AvatarGroup({
  items,
  totalCount,
  maxAvatars = 6,
  className,
  'data-testid': dataTestId,
}: AvatarGroupProps) {
  const visibleItems = items.slice(0, maxAvatars);

  // Overflow is based on totalCount minus visible avatars
  const overflowCount = Math.max(0, totalCount - visibleItems.length);

  // Cap display at +99 for UI consistency
  const displayOverflow = overflowCount > MAX_OVERFLOW_DISPLAY ? `+${MAX_OVERFLOW_DISPLAY}` : `+${overflowCount}`;

  if (items.length === 0) return null;

  return (
    <Container overrideDefaults className={cn('flex items-center', className)} data-testid={dataTestId}>
      {visibleItems.map((item, index) => (
        <Container
          key={item.id}
          overrideDefaults
          className="relative rounded-full shadow-xs"
          style={{ marginLeft: index === 0 ? 0 : '-8px', zIndex: visibleItems.length + index }}
        >
          <AvatarWithFallback avatarUrl={item.avatarUrl} name={item.name || 'User'} fallbackSeed={item.id} size="md" />
        </Container>
      ))}
      {overflowCount > 0 && (
        <Container
          overrideDefaults
          className="relative flex size-8 items-center justify-center rounded-full border border-muted-foreground bg-background text-sm font-medium shadow-xs"
          style={{ marginLeft: '-8px', zIndex: visibleItems.length + 1 }}
        >
          {displayOverflow}
        </Container>
      )}
    </Container>
  );
}
