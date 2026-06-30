'use client';

import { StickyNote } from 'lucide-react';
import { useFormatter } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

interface CollectionCountBadgeProps {
  count: number;
}

/**
 * CollectionCountBadge
 *
 * Compact item-count badge (sticky-note icon + count) shared across the
 * collections surfaces — the bookmarks hero, the pinned bookmarks card, the
 * collection grid card, and the single-collection hero — so they all stay
 * visually in sync.
 *
 * Compact notation (e.g. 1.2K, 3M) keeps long counts from blowing out the
 * header row.
 */
export function CollectionCountBadge({ count }: CollectionCountBadgeProps) {
  const format = useFormatter();

  return (
    <Container overrideDefaults className="flex items-center gap-1 text-muted-foreground">
      <StickyNote className="size-3 shrink-0" />
      <Typography as="span" overrideDefaults className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
        {format.number(count, { notation: 'compact' })}
      </Typography>
    </Container>
  );
}
