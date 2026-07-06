'use client';

import { StickyNote } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface CollectionCountBadgeProps {
  count: number;
  /**
   * Renders the count as a filled `bg-card` pill so it stays legible over a
   * collection cover image. Left off (the default) on background-less surfaces
   * — a plain `bg-card` pill would be invisible on a `bg-card` card and, worse,
   * show a stray pill on the `preview` CollectionCard (which sits on
   * `bg-muted`/`bg-accent`).
   */
  onCover?: boolean;
}

/**
 * CollectionCountBadge
 *
 * Compact item-count badge (sticky-note icon + "N POSTS" label) shared across
 * the collections surfaces — the bookmarks hero, the pinned bookmarks card, the
 * collection grid card, and the single-collection hero — so they all stay
 * visually in sync.
 *
 * Compact notation (e.g. 1.2K, 3M) keeps long counts from blowing out the
 * header row. Pass `onCover` to render the pill treatment over a cover image.
 */
export function CollectionCountBadge({ count, onCover = false }: CollectionCountBadgeProps) {
  const format = useFormatter();
  const t = useTranslations('collections');

  return (
    <Container
      overrideDefaults
      className={cn(
        'flex shrink-0 items-center gap-1 text-secondary-foreground',
        onCover && 'h-6 justify-center rounded-full bg-card px-2 py-1',
      )}
    >
      <StickyNote className="size-3 shrink-0" />
      <Typography as="span" overrideDefaults className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
        {format.number(count, { notation: 'compact' })} {t('postCount', { count })}
      </Typography>
    </Container>
  );
}
