import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

import { TAGS_OVERVIEW_SKELETON_WIDTHS } from './HotTagsOverview.constants';
import { cn } from '@/libs/utils/utils';

export function HotTagsOverviewSkeleton() {
  return (
    <Container overrideDefaults className="flex flex-wrap content-start gap-2">
      {TAGS_OVERVIEW_SKELETON_WIDTHS.map((widthClass, index) => (
        <Skeleton
          key={`hot-tags-overview-skeleton-${index}`}
          className={cn('h-8 rounded-md', widthClass)}
          data-testid={`hot-tags-overview-skeleton-${index}`}
        />
      ))}
    </Container>
  );
}
