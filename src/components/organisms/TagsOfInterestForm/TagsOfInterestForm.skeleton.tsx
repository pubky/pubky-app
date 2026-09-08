import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { ONBOARDING_INTERESTS_SUGGESTED_COUNT } from '@/config/tags';

export function PopularInterestTagsSkeleton({ count = ONBOARDING_INTERESTS_SUGGESTED_COUNT }: { count?: number }) {
  return (
    <Container
      overrideDefaults
      className="flex flex-row flex-wrap content-start gap-2"
      data-testid="popular-interests-loading"
    >
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-8 w-20 rounded-full" />
      ))}
    </Container>
  );
}
