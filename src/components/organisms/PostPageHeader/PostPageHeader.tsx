'use client';

import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import type { PostPageHeaderProps } from './PostPageHeader.types';
import { PostPageBreadcrumb } from '@/organisms/PostPageBreadcrumb';

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
  const { ancestors, isLoading: ancestorsLoading } = Hooks.usePostAncestors(postId);
  const { navigateToPost } = Hooks.usePostNavigation();

  // Get user IDs from ancestors to fetch their names
  const userIds = React.useMemo(() => ancestors.map((a) => a.userId), [ancestors]);

  // Fetch user details for all ancestors
  const { users: userDetailsArray, isLoading: usersLoading } = Hooks.useUserDetailsFromIds({
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

  // Don't render anything while loading
  if (isLoading || !authorName) {
    return (
      <Atoms.PageHeader data-testid="post-page-header-loading">
        <Atoms.Container className="flex items-center justify-between" overrideDefaults>
          <Atoms.Container overrideDefaults className="h-8 w-48 animate-pulse rounded bg-muted" />
          <Atoms.Container overrideDefaults className="h-5 w-32 animate-pulse rounded bg-muted" />
        </Atoms.Container>
      </Atoms.PageHeader>
    );
  }

  const titlePrefix = hasParents ? 'Reply by' : 'Post by';

  return (
    <Atoms.PageHeader data-testid="post-page-header" className="pt-0 pb-3">
      <Atoms.Container
        className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4"
        overrideDefaults
      >
        {/* Title */}
        <Atoms.Typography
          as="h1"
          overrideDefaults
          className="text-2xl leading-8 font-light text-muted-foreground"
          data-testid="post-page-title"
        >
          {titlePrefix} {authorName}
        </Atoms.Typography>

        {/* Breadcrumb (only for replies) */}
        {hasParents && (
          <PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={navigateToPost} />
        )}
      </Atoms.Container>
    </Atoms.PageHeader>
  );
}
