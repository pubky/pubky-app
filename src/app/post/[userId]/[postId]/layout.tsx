'use client';

import { useParams } from 'next/navigation';
import { buildCompositeId } from '@/models/models.utils';
import { PostPageShell } from '@/organisms/PostPageShell/PostPageShell';

/**
 * Layout for direct navigation to `/post/[userId]/[postId]`.
 *
 * Hoists {@link PostPageShell} so feed navigation and search chrome match `/home`
 * without remounting when only the post id segment changes. The intercepted
 * `(.)post` route under `(feeds)` does not use this layout — it wraps content
 * via {@link SinglePost} instead.
 */
export default function PostDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const userId = params.userId as string;
  const postId = params.postId as string;
  const compositeId = buildCompositeId({ pubky: userId, id: postId });

  return <PostPageShell postId={compositeId}>{children}</PostPageShell>;
}
