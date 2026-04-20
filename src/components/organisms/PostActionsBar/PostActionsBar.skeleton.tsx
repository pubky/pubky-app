import * as Atoms from '@/atoms';
import * as Libs from '@/libs';

const ACTION_BUTTON_COUNT = 5;

export function PostActionsBarSkeleton({ className }: { className?: string }) {
  return (
    <Atoms.Container overrideDefaults className={Libs.cn('flex justify-between', className)}>
      <Atoms.Skeleton className="h-8 w-8 rounded-sm" />
      <Atoms.Container overrideDefaults className="flex gap-2">
        {Array.from({ length: ACTION_BUTTON_COUNT }).map((_, i) => (
          <Atoms.Skeleton key={`post-actions-skeleton-${i}`} className="h-8 w-14 rounded-full" />
        ))}
      </Atoms.Container>
    </Atoms.Container>
  );
}
