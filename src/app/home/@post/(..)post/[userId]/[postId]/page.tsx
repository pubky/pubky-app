// Learn more about Next.js parallel and intercepted routes:
// https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes#modals

import * as Templates from '@/templates';
import type { PostPageProps } from '@/app/post/[userId]/[postId]/page';
import { buildCompositeId } from '@/models/models.utils';
export default async function PostPageIntercept({ params }: PostPageProps) {
  const { userId, postId } = await params;
  const compositeId = buildCompositeId({ pubky: userId, id: postId });

  return <Templates.SinglePost postId={compositeId} />;
}
