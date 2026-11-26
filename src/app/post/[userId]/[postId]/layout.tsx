'use client';

import { usePathname } from 'next/navigation';
import { matchPostRoute } from '@/app/routes';
import { buildCompositeId } from '@/models/models.utils';
import { PostPageShell } from '@/organisms/PostPageShell/PostPageShell';

/**
 * Layout for direct navigation to `/post/[userId]/[postId]`.
 *
 * Hoists {@link PostPageShell} so feed navigation and search chrome match `/home`
 * without remounting when only the post id segment changes. The intercepted
 * `(.)post` route under `(feeds)` does not use this layout — it wraps content
 * via {@link SinglePost} instead.
 *
 * The ids come from the URL path, never `useParams`: the static export renders this layout under
 * placeholder params.
 */
export default function PostDetailLayout({ children }: { children: React.ReactNode }) {
  const route = matchPostRoute(usePathname());
  if (!route) return children;
  const compositeId = buildCompositeId({ pubky: route.userId, id: route.postId });

  return <PostPageShell postId={compositeId}>{children}</PostPageShell>;
}
