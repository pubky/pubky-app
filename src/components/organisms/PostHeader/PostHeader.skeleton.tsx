import * as Atoms from '@/atoms';

export function PostHeaderSkeleton() {
  return (
    <Atoms.Container className="flex min-w-0 items-start justify-between gap-3" overrideDefaults>
      <Atoms.Container className="flex min-w-0 items-center gap-3" overrideDefaults>
        <Atoms.Skeleton className="size-10 shrink-0 rounded-full" />
        <Atoms.Container className="flex flex-col gap-1.5" overrideDefaults>
          <Atoms.Skeleton className="h-4 w-24 rounded-md" />
          <Atoms.Skeleton className="h-3 w-16 rounded-md" />
        </Atoms.Container>
      </Atoms.Container>
      <Atoms.Skeleton className="h-3 w-12 rounded-md" />
    </Atoms.Container>
  );
}
