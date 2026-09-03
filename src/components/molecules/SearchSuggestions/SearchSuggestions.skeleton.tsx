import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

// Placeholder counts only sketch a typical response — the real sections render
// however many results come back, so there is no layout constant to mirror.
const SKELETON_TAG_COUNT = 3;
const SKELETON_USER_COUNT = 3;

/** Loading placeholder mirroring the autocomplete Tags + Users sections. */
export function SearchSuggestionsSkeleton() {
  return (
    <Container
      overrideDefaults
      data-testid="search-suggestions-skeleton"
      className="flex flex-col space-y-6"
      aria-hidden="true"
    >
      <Container overrideDefaults className="flex flex-col gap-2">
        <Skeleton className="h-4 w-12 rounded-md" />
        <Container overrideDefaults className="flex flex-wrap gap-2">
          {Array.from({ length: SKELETON_TAG_COUNT }, (_, index) => (
            <Skeleton key={`tag-${index}`} className="h-8 w-20 rounded-md" />
          ))}
        </Container>
      </Container>
      <Container overrideDefaults className="flex flex-col gap-2">
        <Skeleton className="h-4 w-12 rounded-md" />
        <Container overrideDefaults className="flex flex-wrap gap-x-6 gap-y-3">
          {Array.from({ length: SKELETON_USER_COUNT }, (_, index) => (
            <Container key={`user-${index}`} overrideDefaults className="flex items-center gap-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Container overrideDefaults className="space-y-1.5">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
              </Container>
            </Container>
          ))}
        </Container>
      </Container>
    </Container>
  );
}
