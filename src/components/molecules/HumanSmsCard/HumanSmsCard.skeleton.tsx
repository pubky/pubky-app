import * as Atoms from '@/atoms';

/**
 * Skeleton loading state for SMS verification card.
 */
export function HumanSmsCardSkeleton() {
  return (
    <Atoms.Container className="relative flex-1">
      <Atoms.Card data-testid="sms-verification-card-skeleton" className="flex-1 gap-0 p-6 md:p-12">
        <Atoms.Container className="flex-col gap-10 lg:flex-row lg:items-center lg:gap-12">
          {/* Image skeleton - hidden on mobile */}
          <Atoms.Container className="hidden h-full w-full flex-1 items-center lg:block lg:w-auto">
            <Atoms.Skeleton className="size-48 rounded" />
          </Atoms.Container>

          <Atoms.Container className="w-full flex-1 items-start gap-6">
            <Atoms.Container className="w-full gap-3">
              <Atoms.Skeleton className="h-8 w-48 rounded" />
              <Atoms.Skeleton className="h-12 w-20 rounded lg:h-15" />
              <Atoms.Skeleton className="h-4 w-44 rounded" />
              <Atoms.Container className="gap-1">
                <Atoms.Skeleton className="h-6 w-24 rounded" />
                <Atoms.Skeleton className="h-6 w-32 rounded" />
              </Atoms.Container>
            </Atoms.Container>
            <Atoms.Skeleton className="h-10 w-36 rounded-full" />
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Card>
    </Atoms.Container>
  );
}
