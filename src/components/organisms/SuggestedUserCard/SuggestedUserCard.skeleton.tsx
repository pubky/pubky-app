import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function SuggestedUserCardSkeleton() {
  return (
    <Container className="gap-3 rounded-md border border-accent bg-card p-6" data-testid="suggested-user-card-skeleton">
      <Container overrideDefaults className="flex items-start justify-between gap-2">
        <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Container overrideDefaults className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md" />
          </Container>
        </Container>
        <Container overrideDefaults className="flex shrink-0 items-center gap-3">
          <Container className="items-start gap-1">
            <Skeleton className="h-3 w-8 rounded-md" />
            <Skeleton className="h-4 w-6 rounded-md" />
          </Container>
          <Container className="items-start gap-1">
            <Skeleton className="h-3 w-8 rounded-md" />
            <Skeleton className="h-4 w-6 rounded-md" />
          </Container>
        </Container>
      </Container>
      <Container overrideDefaults className="flex items-center gap-3">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md" />
        <Skeleton className="ml-auto size-8 rounded-full" />
      </Container>
    </Container>
  );
}
