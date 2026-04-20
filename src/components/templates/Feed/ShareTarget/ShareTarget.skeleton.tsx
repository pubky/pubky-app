import * as Atoms from '@/atoms';

export function ShareTargetSkeleton() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Atoms.Container className="mx-auto w-full max-w-2xl gap-4 p-4">
        <Atoms.Container className="flex-row items-center justify-between" overrideDefaults>
          <Atoms.Skeleton className="h-6 w-32 rounded-md" />
          <Atoms.Skeleton className="h-8 w-16 rounded-md" />
        </Atoms.Container>
        <Atoms.Skeleton className="h-32 w-full rounded-md" />
      </Atoms.Container>
    </div>
  );
}
