import * as Atoms from '@/atoms';

export function GenericPreviewSkeleton() {
  return (
    <Atoms.Container className="justify-between gap-6 rounded-md p-6 lg:flex-row">
      <Atoms.Container className="gap-y-2">
        <Atoms.Skeleton className="h-5 w-48 rounded-md" />
        <Atoms.Skeleton className="h-4 w-32 rounded-md" />
      </Atoms.Container>
      <Atoms.Skeleton className="h-25 w-45 shrink-0 rounded-md" />
    </Atoms.Container>
  );
}
