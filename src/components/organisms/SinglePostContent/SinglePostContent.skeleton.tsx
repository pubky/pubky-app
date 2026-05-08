import { Card, CardContent } from '@/atoms/Card/Card';
import { PostActionsBarSkeleton } from '../PostActionsBar/PostActionsBar.skeleton';
import { PostContentBaseSkeleton } from '../PostContentBase/PostContentBase.skeleton';
import { PostHeaderSkeleton } from '../PostHeader/PostHeader.skeleton';
import { PostPageHeaderSkeleton } from '../PostPageHeader/PostPageHeader.skeleton';

export function SinglePostContentSkeleton() {
  return (
    <>
      <PostPageHeaderSkeleton />
      <Card className="min-w-0 flex-1 gap-0 rounded-md py-0">
        <CardContent className="flex min-w-0 flex-col gap-4 p-6">
          <PostHeaderSkeleton />
          <PostContentBaseSkeleton />
          <PostActionsBarSkeleton />
        </CardContent>
      </Card>
    </>
  );
}
