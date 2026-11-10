import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';
import { PostActionsBarSkeleton } from '@/organisms/PostActionsBar/PostActionsBar.skeleton';

// Only Tags carries a count (wider); Reply, Post about this, Save and ⋯ are icon-only.
const RESOURCE_ACTION_BUTTON_WIDTHS = ['w-12', 'w-9', 'w-9', 'w-9', 'w-9'];

interface ResourceCardSkeletonProps {
  /** Also hold the place of the bottom zone (tags and the post's action buttons); not while composing. */
  withActions?: boolean;
  /** `large`: the resource page's large card: its surface and wider padding, bigger image and title from `sm`. */
  size?: 'default' | 'large';
}

/**
 * Loading state of `ResourceCard`, in its frame: type and source on top, image and title beside
 * it, then the bottom zone (the tags' "+", then the action buttons, as on a post).
 */
export function ResourceCardSkeleton({ withActions = false, size = 'default' }: ResourceCardSkeletonProps) {
  const isLarge = size === 'large';
  return (
    <Container
      overrideDefaults
      data-testid="resource-card-skeleton"
      data-size={size}
      className={cn(
        'flex w-full min-w-0 flex-col overflow-hidden rounded-md bg-embed',
        isLarge && 'bg-card text-card-foreground shadow-sm',
      )}
    >
      <Container overrideDefaults className={cn('flex flex-col gap-3', isLarge ? 'p-6' : 'p-4')}>
        <Container overrideDefaults className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </Container>
        <Container overrideDefaults className="flex gap-4">
          <Skeleton className={cn('shrink-0 rounded-md', isLarge ? 'size-24 sm:size-40' : 'size-20 sm:size-24')} />
          <Container className="min-w-0 flex-1 gap-2">
            <Skeleton className={cn('w-48 max-w-full rounded-md', isLarge ? 'h-7 sm:h-8 sm:w-72' : 'h-5')} />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-32 rounded-md" />
          </Container>
        </Container>
      </Container>
      {withActions && (
        <Container
          overrideDefaults
          data-testid="resource-card-skeleton-actions"
          className={cn(
            'flex flex-col items-start gap-3 md:flex-row md:justify-between md:gap-4 @max-xl/grid:flex-col! @max-xl/grid:items-start! @max-xl/grid:gap-3!',
            isLarge ? 'px-6 py-4' : 'px-4 py-3',
          )}
        >
          <Skeleton className="size-8 rounded-md" />
          <PostActionsBarSkeleton widths={RESOURCE_ACTION_BUTTON_WIDTHS} surface={isLarge ? 'default' : 'muted'} />
        </Container>
      )}
    </Container>
  );
}
