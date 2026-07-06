'use client';

import { Card } from '@/atoms/Card/Card';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';
import { usePostMainLayout } from '@/organisms/PostMain/PostMainLayoutContext';
import { getEffectiveTagsLayout } from '@/organisms/PostMain/PostMainLayoutRules';
import { PostMainListRowSkeleton } from '@/organisms/PostMain/PostMainListRow/PostMainListRow.skeleton';

export function TimelinePostSkeleton() {
  const isMobile = useIsMobile();
  const tagsLayout = getEffectiveTagsLayout(usePostMainLayout() ?? 'inline', isMobile);

  if (tagsLayout === 'list') {
    return (
      <Card className="min-w-0 flex-1 gap-0 rounded-md py-0">
        <PostMainListRowSkeleton />
      </Card>
    );
  }

  return <PostCardSkeleton />;
}
