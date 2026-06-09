'use client';

import { StickyNote } from 'lucide-react';
import { useFormatter } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface BookmarkCountBadgeProps {
  count: number;
  className?: string;
}

/**
 * BookmarkCountBadge
 *
 * Compact "N items" badge (sticky-note icon + count) shared by the bookmarks
 * hero and the pinned bookmarks card so the two stay visually in sync.
 *
 * Compact notation (e.g. 1.2K, 3M) keeps long counts from blowing out the
 * header row, mirroring `CollectionCard`'s item-count formatting.
 */
export function BookmarkCountBadge({ count, className }: BookmarkCountBadgeProps) {
  const format = useFormatter();

  return (
    <Container overrideDefaults className={cn('flex items-center gap-1 text-muted-foreground', className)}>
      <StickyNote className="size-3" />
      <Typography as="span" overrideDefaults className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
        {format.number(count, { notation: 'compact' })}
      </Typography>
    </Container>
  );
}
