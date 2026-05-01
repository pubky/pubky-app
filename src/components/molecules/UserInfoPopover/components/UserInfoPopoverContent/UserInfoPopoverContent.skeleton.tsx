'use client';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

/**
 * Skeleton loading state for the user info popover.
 * Matches the layout of UserInfoPopoverContent.
 */
export function UserInfoPopoverSkeleton() {
  return (
    <Container className="gap-3">
      {/* Header */}
      <Container className="flex min-w-0 items-center gap-2" overrideDefaults>
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <Container className="min-w-0 flex-1 gap-1">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </Container>
      </Container>

      {/* Bio */}
      <Skeleton className="h-6 w-full rounded" />

      {/* Stats */}
      <Container className="flex items-start gap-2.5" overrideDefaults>
        <Container className="flex-1 gap-2">
          <Skeleton className="h-4 w-20 rounded" />
        </Container>
        <Container className="flex-1 gap-2">
          <Skeleton className="h-4 w-20 rounded" />
        </Container>
      </Container>

      {/* Button */}
      <Skeleton className="h-8 w-24 rounded" />
    </Container>
  );
}
