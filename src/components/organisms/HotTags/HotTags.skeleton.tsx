import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { MAX_TAGS } from './HotTags.constants';

export function HotTagsSkeleton() {
  return (
    <Container overrideDefaults className="flex w-full flex-col gap-2">
      {Array.from({ length: MAX_TAGS }).map((_, index) => (
        <Skeleton key={`hot-tag-skeleton-${index}`} data-testid="hot-tag-skeleton" className="h-8 w-full rounded-md" />
      ))}
    </Container>
  );
}
