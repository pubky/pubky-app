import * as Atoms from '@/atoms';
import { HOT_TAGS_FEATURED_COUNT } from '@/config';
import { MAX_AVATARS_DEFAULT } from './HotTagsCardsSection.constants';

export function HotTagsCardsSectionSkeleton({ maxAvatars = MAX_AVATARS_DEFAULT }: { maxAvatars?: number }) {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-3 sm:flex-row">
      {Array.from({ length: HOT_TAGS_FEATURED_COUNT }).map((_, index) => (
        <Atoms.Container
          key={`hot-tags-cards-skeleton-${index}`}
          overrideDefaults
          className="flex min-h-[148px] min-w-0 flex-1 flex-col justify-between gap-4 rounded-md bg-card px-6 py-6 shadow-sm"
          data-testid={`hot-tags-card-skeleton-${index}`}
        >
          <Atoms.Container overrideDefaults className="flex flex-col gap-2.5">
            <Atoms.Container overrideDefaults className="flex items-center gap-3">
              <Atoms.Skeleton className="size-6 rounded-full" />
              <Atoms.Skeleton className="h-6 w-28 rounded-md" />
            </Atoms.Container>
            <Atoms.Skeleton className="h-5 w-20 rounded-md" />
          </Atoms.Container>
          <Atoms.Container overrideDefaults className="flex items-center gap-1.5">
            {Array.from({ length: maxAvatars }).map((__, avatarIndex) => (
              <Atoms.Skeleton
                key={`hot-tags-cards-skeleton-avatar-${index}-${avatarIndex}`}
                className="size-7 rounded-full"
              />
            ))}
          </Atoms.Container>
        </Atoms.Container>
      ))}
    </Atoms.Container>
  );
}
