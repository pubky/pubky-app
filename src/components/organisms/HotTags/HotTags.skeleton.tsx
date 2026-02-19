import * as Atoms from '@/atoms';
import { MAX_TAGS } from './HotTags.constants';

export function HotTagsSkeleton() {
  return (
    <Atoms.Container overrideDefaults className="flex w-full flex-col gap-2">
      {Array.from({ length: MAX_TAGS }).map((_, index) => (
        <Atoms.Skeleton
          key={`hot-tag-skeleton-${index}`}
          data-testid="hot-tag-skeleton"
          className="h-8 w-full rounded-md"
        />
      ))}
    </Atoms.Container>
  );
}
