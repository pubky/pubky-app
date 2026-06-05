'use client';

import { Card } from '@/atoms/Card/Card';
import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';
import { usePostMainLayout } from '@/organisms/PostMain/PostMainLayoutContext';
import { PostMainListRowSkeleton } from '@/organisms/PostMain/PostMainListRow.skeleton';

export function TimelinePostSkeleton() {
  const tagsLayout = usePostMainLayout();

  if (tagsLayout === 'list') {
    return (
      <Card className="min-w-0 flex-1 gap-0 rounded-md py-0">
        <PostMainListRowSkeleton />
      </Card>
    );
  }

  return <PostCardSkeleton />;
}
