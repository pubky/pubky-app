import * as Atoms from '@/atoms';

export function EditProfileFormSkeleton() {
  return (
    <Atoms.Container className="flex w-full flex-1 flex-col gap-6 lg:flex-none">
      <Atoms.Card className="rounded-md bg-card p-6 md:p-12 lg:flex lg:flex-row lg:gap-12">
        {/* Profile fields */}
        <Atoms.Container className="w-full gap-6">
          <Atoms.Skeleton className="h-7 w-20 rounded-md" />
          <Atoms.Container className="gap-6">
            <Atoms.Container className="gap-2">
              <Atoms.Skeleton className="h-3 w-12 rounded-md" />
              <Atoms.Skeleton className="h-10 w-full rounded-md" />
            </Atoms.Container>
            <Atoms.Container className="gap-2">
              <Atoms.Skeleton className="h-3 w-8 rounded-md" />
              <Atoms.Skeleton className="h-24 w-full rounded-md" />
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Container>

        {/* Links fields */}
        <Atoms.Container className="mt-6 w-full gap-6 lg:mt-0">
          <Atoms.Skeleton className="h-7 w-16 rounded-md" />
          <Atoms.Container className="gap-6">
            <Atoms.Container className="gap-2">
              <Atoms.Skeleton className="h-3 w-16 rounded-md" />
              <Atoms.Skeleton className="h-10 w-full rounded-md" />
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Container>

        {/* Avatar */}
        <Atoms.Container className="mt-6 w-full gap-6 lg:mt-0">
          <Atoms.Skeleton className="mx-auto h-7 w-16 rounded-md" />
          <Atoms.Skeleton className="mx-auto size-48 rounded-full" />
          <Atoms.Skeleton className="mx-auto h-8 w-28 rounded-full" />
        </Atoms.Container>
      </Atoms.Card>

      {/* Bottom buttons */}
      <Atoms.Container className="mt-auto flex-row justify-between">
        <Atoms.Skeleton className="h-10 w-28 rounded-full" />
        <Atoms.Skeleton className="h-10 w-28 rounded-full" />
      </Atoms.Container>
    </Atoms.Container>
  );
}
