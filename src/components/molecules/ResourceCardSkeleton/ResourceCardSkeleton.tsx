import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { PostActionsBarSkeleton } from '@/organisms/PostActionsBar/PostActionsBar.skeleton';

// Only Tags carries a count (wider); Reply, Post about this, Save and ⋯ are icon-only.
const RESOURCE_ACTION_BUTTON_WIDTHS = ['w-12', 'w-9', 'w-9', 'w-9', 'w-9'];

interface ResourceCardSkeletonProps {
  /** Also hold the place of the bottom zone (tags and the post's action buttons); not while composing. */
  withActions?: boolean;
}

/**
 * Loading state of `ResourceCard`, in its frame: type and source on top, image and title beside
 * it, then the bottom zone (the tags' "+", then the action buttons, as on a post).
 */
export function ResourceCardSkeleton({ withActions = false }: ResourceCardSkeletonProps) {
  return (
    <Container
      overrideDefaults
      data-testid="resource-card-skeleton"
      className="flex w-full min-w-0 flex-col overflow-hidden rounded-md bg-embed"
    >
      <Container overrideDefaults className="flex flex-col gap-3 p-4">
        <Container overrideDefaults className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </Container>
        <Container overrideDefaults className="flex gap-4">
          <Skeleton className="size-20 shrink-0 rounded-md sm:size-24" />
          <Container className="min-w-0 flex-1 gap-2">
            <Skeleton className="h-5 w-48 max-w-full rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-32 rounded-md" />
          </Container>
        </Container>
      </Container>
      {withActions && (
        <Container
          overrideDefaults
          data-testid="resource-card-skeleton-actions"
          className="flex flex-col items-start gap-3 px-4 py-3 md:flex-row md:justify-between md:gap-4 @max-xl/grid:flex-col! @max-xl/grid:items-start! @max-xl/grid:gap-3!"
        >
          <Skeleton className="size-8 rounded-md" />
          <PostActionsBarSkeleton widths={RESOURCE_ACTION_BUTTON_WIDTHS} surface="muted" />
        </Container>
      )}
    </Container>
  );
}
