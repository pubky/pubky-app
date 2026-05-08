import type { PostPageProps } from '@/app/post/[userId]/[postId]/page';
import { buildCompositeId } from '@/models/models.utils';
import { SinglePost } from '@/templates/Post/SinglePost/SinglePost';

export default async function PostPageIntercept({ params }: PostPageProps) {
  const { userId, postId } = await params;
  const compositeId = buildCompositeId({ pubky: userId, id: postId });

  return <SinglePost postId={compositeId} />;
}
