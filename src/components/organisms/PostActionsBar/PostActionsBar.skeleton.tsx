import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

import { cn } from '@/libs/utils/utils';

const ACTION_BUTTON_COUNT = 5;

export function PostActionsBarSkeleton({ className }: { className?: string }) {
  return (
    <Container overrideDefaults className={cn('flex justify-between', className)}>
      <Skeleton className="h-8 w-8 rounded-sm" />
      <Container overrideDefaults className="flex gap-2">
        {Array.from({ length: ACTION_BUTTON_COUNT }).map((_, i) => (
          <Skeleton key={`post-actions-skeleton-${i}`} className="h-8 w-14 rounded-full" />
        ))}
      </Container>
    </Container>
  );
}
