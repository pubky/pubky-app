'use client';

import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { DiscoverCollections } from '@/organisms/Collections/DiscoverCollections/DiscoverCollections';
import { FollowedCollections } from '@/organisms/Collections/FollowedCollections/FollowedCollections';
import { MyCollections } from '@/organisms/Collections/MyCollections/MyCollections';
import { useAuthStore } from '@/stores/auth/auth.store';

interface CollectionsSectionsProps {
  className?: string;
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
 *
 * `MyCollections` and `FollowedCollections` require a signed-in viewer
 * (bookmarks / authored streams). Guests only see `DiscoverCollections`.
 */
export function CollectionsSections({ className }: CollectionsSectionsProps) {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const showPersonalSections = hasHydrated && Boolean(currentUserPubky);

  return (
    <Container overrideDefaults className={cn('flex w-full flex-col gap-12', className)}>
      {showPersonalSections ? (
        <>
          <MyCollections />
          <FollowedCollections />
        </>
      ) : null}
      <DiscoverCollections />
    </Container>
  );
}
