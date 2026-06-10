'use client';

import { PostPageShell } from '@/organisms/PostPageShell/PostPageShell';
import type { SinglePostProps } from './SinglePost.types';
import { SinglePostPage } from './SinglePostPage';

/**
 * SinglePost Template
 *
 * Full post experience (shell + body). Used by the intercepted `(.)post` parallel
 * route, which does not inherit `app/post/[userId]/[postId]/layout.tsx`.
 *
 * For direct `/post/...` navigation, prefer rendering {@link SinglePostPage} in
 * `page.tsx` so the segment layout owns the persistent shell.
 */
export function SinglePost({ postId }: SinglePostProps) {
  return (
    <PostPageShell postId={postId}>
      <SinglePostPage postId={postId} />
    </PostPageShell>
  );
}
