'use client';

import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { DiscoverCollections } from '@/organisms/Collections/DiscoverCollections/DiscoverCollections';
import { FollowedCollections } from '@/organisms/Collections/FollowedCollections/FollowedCollections';
import { MyCollections } from '@/organisms/Collections/MyCollections/MyCollections';

interface CollectionsSectionsProps {
  className?: string;
  showMyCollectionsPublicNote?: boolean;
}

/**
 * CollectionsSections
 *
 * Stacks the three sibling section organisms (`MyCollections`,
 * `FollowedCollections`, `DiscoverCollections`) in their canonical order.
 *
 * **Pure composition** — no header logic, no coordination state, no
 * shared fetch. Each section owns its own header and data flow per the
 * Phase 3 design.
 */
export function CollectionsSections({ className, showMyCollectionsPublicNote = false }: CollectionsSectionsProps) {
  return (
    <Container overrideDefaults className={cn('flex w-full flex-col gap-12', className)}>
      <MyCollections showPublicNote={showMyCollectionsPublicNote} />
      <FollowedCollections />
      <DiscoverCollections />
    </Container>
  );
}
