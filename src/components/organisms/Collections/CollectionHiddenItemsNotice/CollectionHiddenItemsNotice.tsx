'use client';

import { Info } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

/**
 * Info banner for the single-collection Visual layout: the mosaic only renders
 * posts carrying image/video media, so collections holding other post kinds
 * show fewer items than they contain. Uses the shared card surface (like the
 * hero) so it reads as part of the page rather than a faint tint.
 */
export function CollectionHiddenItemsNotice() {
  return (
    <Container
      overrideDefaults
      role="status"
      data-cy="collection-hidden-items-notice"
      className="flex w-full items-center gap-3 rounded-md bg-card p-4"
    >
      <Info aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <Typography overrideDefaults className="text-sm font-medium text-muted-foreground">
        {'Some items in this collection are hidden due to the selected layout type.'}
      </Typography>
    </Container>
  );
}
