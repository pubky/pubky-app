'use client';

import { StickyNote } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact' });

interface CollectionCountBadgeProps {
  count: number;
  /** Keep the text label visible below the `sm` breakpoint. */
  showLabelOnMobile?: boolean;
  /**
   * Pill contrast against the parent surface. Always rendered as a pill.
   *
   * - `on-card` (default): `bg-background` on `bg-card` parents (landing, hero,
   *   bookmarks, embeds with a cover image).
   * - `on-muted`: `bg-card` on `bg-muted` embed chrome (`presentation="embed"`
   *   without a cover — see `embeddedOnMuted` in `CollectionCard`).
   */
  tone?: 'on-card' | 'on-muted';
}

/**
 * CollectionCountBadge
 *
 * Compact item-count badge (sticky-note icon + count; "N POSTS" label from `sm`
 * upward by default) shared across the collections surfaces — the bookmarks hero,
 * the pinned collection grid card, and the single-collection hero — so they all
 * stay visually in sync. Collection cards opt into showing the label on mobile.
 *
 * Renders as a pill so the count stays legible against the parent surface.
 * Default tone is `on-card` (`bg-background`). `CollectionCard` passes `on-muted`
 * (`bg-card`) for interactive embeds on `bg-muted` when the collection has no
 * cover image.
 *
 * Compact notation (e.g. 1.2K, 3M) keeps long counts from blowing out the
 * header row.
 */
export function CollectionCountBadge({
  count,
  showLabelOnMobile = false,
  tone = 'on-card',
}: CollectionCountBadgeProps) {
  const isOnMuted = tone === 'on-muted';
  const compactCount = compactNumber.format(count);
  const countLabel = count === 1 ? 'post' : 'posts';

  return (
    <Container
      overrideDefaults
      data-cy="collection-count-badge"
      aria-label={`${compactCount} ${countLabel}`}
      className={cn(
        'flex h-6 shrink-0 items-center justify-center gap-1 rounded-full px-2 py-1 text-muted-foreground',
        isOnMuted ? 'bg-card' : 'bg-background',
      )}
    >
      <StickyNote className="size-3 shrink-0" aria-hidden />
      <Typography as="span" overrideDefaults className="text-xs leading-4 font-medium tracking-widest uppercase">
        {compactCount}
        <Typography as="span" overrideDefaults className={cn(showLabelOnMobile ? 'inline' : 'hidden sm:inline')}>
          {` ${countLabel}`}
        </Typography>
      </Typography>
    </Container>
  );
}
