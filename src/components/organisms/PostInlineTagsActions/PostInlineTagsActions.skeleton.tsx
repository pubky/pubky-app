import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';
import { PostActionsBarSkeleton } from '../PostActionsBar/PostActionsBar.skeleton';

// Tag-chip placeholder widths (varying) + the trailing "+" add button (square).
const TAG_CHIP_WIDTHS = ['w-24', 'w-20'];

/**
 * Placeholder for `PostInlineTagsActions` — a tags-chip row plus the actions bar.
 *
 * Mirrors the real component's layout classes exactly so the skeleton matches in
 * every surface: side-by-side at viewport `md` (vertical timeline), and stacked
 * inside a narrow grid cell via the grid-scoped `@max-xl/grid:*!` overrides (D4).
 */
export function PostInlineTagsActionsSkeleton() {
  return (
    <Container
      className={cn(
        'flex-col items-start gap-3 md:flex-row md:items-start md:justify-between md:gap-4',
        '@max-xl/grid:mt-auto @max-xl/grid:flex-col! @max-xl/grid:items-start! @max-xl/grid:gap-3!',
      )}
    >
      <Container overrideDefaults className="flex flex-wrap items-center gap-2">
        {TAG_CHIP_WIDTHS.map((width, i) => (
          <Skeleton key={`post-tag-skeleton-${i}`} className={cn('h-8 rounded-md', width)} />
        ))}
        <Skeleton className="h-8 w-8 rounded-md" />
      </Container>
      <PostActionsBarSkeleton className="w-full shrink-0 justify-start sm:w-auto md:justify-end @max-xl/grid:w-full! @max-xl/grid:justify-start!" />
    </Container>
  );
}
