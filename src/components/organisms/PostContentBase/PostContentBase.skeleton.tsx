import * as Atoms from '@/atoms';

export function PostContentBaseSkeleton() {
  return (
    <Atoms.Container className="flex min-w-0 flex-col gap-y-1" overrideDefaults>
      <Atoms.Skeleton className="h-4 w-full rounded-md" />
      <Atoms.Skeleton className="h-4 w-4/5 rounded-md" />
      <Atoms.Skeleton className="h-4 w-3/5 rounded-md" />
    </Atoms.Container>
  );
}
