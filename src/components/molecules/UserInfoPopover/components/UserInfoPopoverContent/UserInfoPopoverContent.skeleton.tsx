'use client';

import * as Atoms from '@/atoms';

/**
 * Skeleton loading state for the user info popover.
 * Matches the layout of UserInfoPopoverContent.
 */
export function UserInfoPopoverSkeleton() {
  return (
    <Atoms.Container className="gap-3">
      {/* Header */}
      <Atoms.Container className="flex min-w-0 items-center gap-2" overrideDefaults>
        <Atoms.Skeleton className="size-10 shrink-0 rounded-full" />
        <Atoms.Container className="min-w-0 flex-1 gap-1">
          <Atoms.Skeleton className="h-5 w-24 rounded" />
          <Atoms.Skeleton className="h-4 w-16 rounded" />
        </Atoms.Container>
      </Atoms.Container>

      {/* Bio */}
      <Atoms.Skeleton className="h-6 w-full rounded" />

      {/* Stats */}
      <Atoms.Container className="flex items-start gap-2.5" overrideDefaults>
        <Atoms.Container className="flex-1 gap-2">
          <Atoms.Skeleton className="h-4 w-20 rounded" />
        </Atoms.Container>
        <Atoms.Container className="flex-1 gap-2">
          <Atoms.Skeleton className="h-4 w-20 rounded" />
        </Atoms.Container>
      </Atoms.Container>

      {/* Button */}
      <Atoms.Skeleton className="h-8 w-24 rounded" />
    </Atoms.Container>
  );
}
