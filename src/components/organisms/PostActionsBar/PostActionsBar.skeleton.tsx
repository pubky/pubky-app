import * as Atoms from '@/atoms';
import * as Libs from '@/libs';

const ACTION_BUTTON_COUNT = 4;

export function PostActionsBarSkeleton({ className }: { className?: string }) {
  return (
    <Atoms.Container overrideDefaults className={Libs.cn('flex gap-2', className)}>
      {Array.from({ length: ACTION_BUTTON_COUNT }).map((_, i) => (
        <Atoms.Skeleton key={`post-actions-skeleton-${i}`} className="h-8 w-14 rounded-md" />
      ))}
    </Atoms.Container>
  );
}
