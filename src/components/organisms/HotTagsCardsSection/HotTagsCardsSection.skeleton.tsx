import * as Atoms from '@/atoms';
import { HOT_TAGS_FEATURED_COUNT } from '@/config';
import { MAX_AVATARS_DEFAULT } from './HotTagsCardsSection.constants';

function HotTagsCardAvatarSkeletonRow({ index, maxAvatars }: { index: number; maxAvatars: number }) {
  return (
    <Atoms.Container overrideDefaults className="flex items-center gap-1.5">
      {Array.from({ length: maxAvatars }).map((__, avatarIndex) => (
        <Atoms.Skeleton
          key={`hot-tags-cards-skeleton-avatar-${index}-${avatarIndex}`}
          className="size-7 rounded-full"
        />
      ))}
    </Atoms.Container>
  );
}

export function HotTagsCardsSectionSkeleton({ maxAvatars = MAX_AVATARS_DEFAULT }: { maxAvatars?: number }) {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-3 sm:flex-row">
      {Array.from({ length: HOT_TAGS_FEATURED_COUNT }).map((_, index) => (
        <Atoms.Container
          key={`hot-tags-cards-skeleton-${index}`}
          overrideDefaults
          className="flex min-h-[148px] min-w-0 flex-1 flex-col gap-4 overflow-hidden rounded-md bg-card py-6 shadow-sm"
          data-testid={`hot-tags-card-skeleton-${index}`}
        >
          <Atoms.Container overrideDefaults className="flex flex-col gap-1 px-6 sm:gap-2.5">
            <Atoms.Container overrideDefaults className="flex items-center gap-2 sm:gap-3">
              <Atoms.Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <Atoms.Skeleton className="size-6 rounded-full" />
                <Atoms.Skeleton className="h-6 w-28 rounded-md" />
              </Atoms.Container>
              <Atoms.Container overrideDefaults className="flex shrink-0 items-center sm:hidden">
                <HotTagsCardAvatarSkeletonRow index={index} maxAvatars={maxAvatars} />
              </Atoms.Container>
            </Atoms.Container>
            <Atoms.Skeleton className="h-5 w-20 rounded-md" />
          </Atoms.Container>

          <Atoms.Container overrideDefaults className="hidden px-6 sm:flex">
            <HotTagsCardAvatarSkeletonRow index={index} maxAvatars={maxAvatars} />
          </Atoms.Container>
        </Atoms.Container>
      ))}
    </Atoms.Container>
  );
}
