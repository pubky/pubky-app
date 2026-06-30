import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';

// Mirrors the real `PostActionsBar`: tag / reply / repost carry a count (wider),
// save + more are icon-only (narrower). Left-aligned `flex flex-wrap gap-2` group.
const ACTION_BUTTON_WIDTHS = ['w-12', 'w-12', 'w-12', 'w-9', 'w-9'];

export function PostActionsBarSkeleton({ className }: { className?: string }) {
  return (
    <Container overrideDefaults className={cn('flex flex-wrap gap-2', className)}>
      {ACTION_BUTTON_WIDTHS.map((width, i) => (
        <Skeleton key={`post-actions-skeleton-${i}`} className={cn('h-8 rounded-full', width)} />
      ))}
    </Container>
  );
}
