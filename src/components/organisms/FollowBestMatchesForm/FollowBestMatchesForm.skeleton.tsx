import { Container } from '@/atoms/Container/Container';
import { SuggestedUserCardSkeleton } from '@/organisms/SuggestedUserCard/SuggestedUserCard.skeleton';

const DEFAULT_SKELETON_COUNT = 4;

export function SuggestedUsersGridSkeleton({ count = DEFAULT_SKELETON_COUNT }: { count?: number }) {
  return (
    <Container overrideDefaults className="grid gap-3 md:grid-cols-2" data-testid="suggested-people-loading">
      {Array.from({ length: count }).map((_, index) => (
        <SuggestedUserCardSkeleton key={index} />
      ))}
    </Container>
  );
}
