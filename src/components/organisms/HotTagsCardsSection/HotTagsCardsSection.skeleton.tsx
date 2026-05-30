import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { HOT_TAGS_FEATURED_COUNT } from '@/config/tags';
import { MAX_AVATARS_DEFAULT } from './HotTagsCardsSection.constants';

function HotTagsCardAvatarSkeletonRow({ index, maxAvatars }: { index: number; maxAvatars: number }) {
  return (
    <Container overrideDefaults className="flex items-center gap-1.5">
      {Array.from({ length: maxAvatars }).map((__, avatarIndex) => (
        <Skeleton key={`hot-tags-cards-skeleton-avatar-${index}-${avatarIndex}`} className="size-7 rounded-full" />
      ))}
    </Container>
  );
}

export function HotTagsCardsSectionSkeleton({ maxAvatars = MAX_AVATARS_DEFAULT }: { maxAvatars?: number }) {
  return (
    <Container overrideDefaults className="flex flex-col gap-3 sm:flex-row">
      {Array.from({ length: HOT_TAGS_FEATURED_COUNT }).map((_, index) => (
        <Container
          key={`hot-tags-cards-skeleton-${index}`}
          overrideDefaults
          className="flex min-h-[148px] min-w-0 flex-1 flex-col gap-4 overflow-hidden rounded-md bg-card py-6 shadow-sm"
          data-testid={`hot-tags-card-skeleton-${index}`}
        >
          <Container overrideDefaults className="flex flex-col gap-1 px-6 sm:gap-2.5">
            <Container overrideDefaults className="flex items-center gap-2 sm:gap-3">
              <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-md" />
              </Container>
              <Container overrideDefaults className="flex shrink-0 items-center sm:hidden">
                <HotTagsCardAvatarSkeletonRow index={index} maxAvatars={maxAvatars} />
              </Container>
            </Container>
            <Skeleton className="h-5 w-20 rounded-md" />
          </Container>

          <Container overrideDefaults className="hidden px-6 sm:flex">
            <HotTagsCardAvatarSkeletonRow index={index} maxAvatars={maxAvatars} />
          </Container>
        </Container>
      ))}
    </Container>
  );
}
