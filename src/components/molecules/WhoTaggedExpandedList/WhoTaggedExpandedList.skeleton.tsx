'use client';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { TAGS_PER_PAGE } from '@/hooks/usePostTags/usePostTags.constants';

export function WhoTaggedExpandedListSkeleton() {
  return (
    <Container
      aria-label="Who tagged expanded list"
      role="list"
      overrideDefaults
      className="flex max-h-(--who-tagged-expanded-list-max-height) w-full max-w-(--who-tagged-expanded-list-width) flex-col gap-2 overflow-y-auto rounded-md border border-border bg-popover p-4 shadow-2xl"
      data-testid="who-tagged-expanded-list-skeleton"
    >
      {Array.from({ length: TAGS_PER_PAGE }).map((_, index) => (
        <Container
          key={`who-tagged-expanded-list-skeleton-row-${index}`}
          overrideDefaults
          className="flex w-full items-center gap-3"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 max-w-[150px] rounded-md" />
            <Skeleton className="h-4 max-w-[130px] rounded-md" />
          </Container>
          <Skeleton className="size-8 shrink-0 rounded-full" />
        </Container>
      ))}
    </Container>
  );
}
