'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { Typography } from '@/atoms/Typography/Typography';
import { usePostAncestors } from '@/hooks/usePostAncestors/usePostAncestors';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useUserDetailsFromIds } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds';
import { PostPageBreadcrumb } from '../PostPageBreadcrumb/PostPageBreadcrumb';
import { PostPageHeaderSkeleton } from './PostPageHeader.skeleton';
import type { PostPageHeaderProps } from './PostPageHeader.types';

/**
 * PostPageHeader Organism
 *
 * Displays the page title ("Reply by [Name]" or "Post by [Name]") and
 * breadcrumb navigation showing the reply chain hierarchy.
 *
 * The breadcrumb shows the path from the root post to the current post,
 * allowing users to navigate to parent posts in the reply tree.
 *
 * Responsive behavior:
 * - Mobile: Title on top, breadcrumbs below (stacked vertically)
 * - Desktop: Title left, breadcrumbs right (side by side)
 *
 * @example
 * ```tsx
 * <PostPageHeader postId="user123:post456" />
 * // Renders: "Reply by Anna" with breadcrumb "John > Satoshi > Anna"
 * ```
 */
export function PostPageHeader({ postId }: PostPageHeaderProps) {
  const { ancestors, isLoading: ancestorsLoading } = usePostAncestors(postId);
  const { navigateToPost } = usePostNavigation();

  // Get user IDs from ancestors to fetch their names
  const userIds = React.useMemo(() => ancestors.map((a) => a.userId), [ancestors]);

  // Fetch user details for all ancestors
  const { users: userDetailsArray, isLoading: usersLoading } = useUserDetailsFromIds({
    userIds,
    prefetch: true,
  });

  // Create a map for easy lookup
  const userDetailsMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const user of userDetailsArray) {
      map.set(user.id, user.name);
    }
    return map;
  }, [userDetailsArray]);

  // Current post author (last ancestor)
  const currentAncestor = ancestors[ancestors.length - 1];
  const authorName = currentAncestor ? userDetailsMap.get(currentAncestor.userId) : undefined;

  // Has parents if there's more than one ancestor (current + at least one parent)
  const hasParents = ancestors.length > 1;

  const isLoading = ancestorsLoading || usersLoading;

  if (isLoading || !authorName) {
    return <PostPageHeaderSkeleton />;
  }

  const titlePrefix = hasParents ? 'Reply by' : 'Post by';

  return (
    <PageHeader data-testid="post-page-header" className="pt-0 pb-3">
      <Container
        className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4"
        overrideDefaults
      >
        {/* Title */}
        <Typography
          as="h1"
          overrideDefaults
          className="text-2xl leading-8 font-light text-muted-foreground"
          data-testid="post-page-title"
        >
          {titlePrefix} {authorName}
        </Typography>

        {/* Breadcrumb (only for replies) */}
        {hasParents && (
          <PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={navigateToPost} />
        )}
      </Container>
    </PageHeader>
  );
}
