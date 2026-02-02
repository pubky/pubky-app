// Learn more about Next.js parallel and intercepted routes:
// https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes#modals

import * as Templates from '@/templates';
import * as Core from '@/core';
import type { PostPageProps } from '@/app/post/[userId]/[postId]/page';

export default async function PostPageIntercept({ params }: PostPageProps) {
  const { userId, postId } = await params;
  const compositeId = Core.buildCompositeId({ pubky: userId, id: postId });

  return <Templates.SinglePost postId={compositeId} />;
}
