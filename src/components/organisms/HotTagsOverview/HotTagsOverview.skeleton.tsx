import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import { TAGS_OVERVIEW_SKELETON_WIDTHS } from './HotTagsOverview.constants';

export function HotTagsOverviewSkeleton() {
  return (
    <Atoms.Container overrideDefaults className="flex flex-wrap content-start gap-2">
      {TAGS_OVERVIEW_SKELETON_WIDTHS.map((widthClass, index) => (
        <Atoms.Skeleton
          key={`hot-tags-overview-skeleton-${index}`}
          className={Libs.cn('h-8 rounded-md', widthClass)}
          data-testid={`hot-tags-overview-skeleton-${index}`}
        />
      ))}
    </Atoms.Container>
  );
}
