import * as Atoms from '@/atoms';
import { MAX_TAGS } from './HotTags.constants';

export function HotTagsSkeleton() {
  return (
    <Atoms.Container overrideDefaults className="flex w-full flex-col gap-2" data-cy="hot-tags-skeleton-list">
      {Array.from({ length: MAX_TAGS }).map((_, index) => (
        <Atoms.Skeleton key={`hot-tag-skeleton-${index}`} className="h-8 w-full rounded-md" />
      ))}
    </Atoms.Container>
  );
}
