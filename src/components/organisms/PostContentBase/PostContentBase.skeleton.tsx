import * as Atoms from '@/atoms';

export function PostContentBaseSkeleton() {
  return (
    <Atoms.Container className="min-w-0 gap-3" overrideDefaults>
      <Atoms.Skeleton className="h-4 w-full rounded-md" />
      <Atoms.Skeleton className="h-4 w-4/5 rounded-md" />
      <Atoms.Skeleton className="h-4 w-3/5 rounded-md" />
    </Atoms.Container>
  );
}
