import * as Atoms from '@/atoms';
import { PostHeaderSkeleton } from '../PostHeader/PostHeader.skeleton';
import { PostContentBaseSkeleton } from '../PostContentBase/PostContentBase.skeleton';
import { PostActionsBarSkeleton } from '../PostActionsBar/PostActionsBar.skeleton';

export function PostCardSkeleton() {
  return (
    <Atoms.Card className="min-w-0 flex-1 gap-0 rounded-md py-0">
      <Atoms.CardContent className="flex min-w-0 flex-col gap-4 p-6">
        <PostHeaderSkeleton />
        <PostContentBaseSkeleton />
        <PostActionsBarSkeleton />
      </Atoms.CardContent>
    </Atoms.Card>
  );
}
