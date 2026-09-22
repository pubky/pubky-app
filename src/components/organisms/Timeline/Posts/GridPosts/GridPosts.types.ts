import type { ReactNode } from 'react';

export interface TimelineGridPostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /**
   * Whether to render the "You've reached the end" message once the grid is fully
   * loaded. Defaults to `true`. Collection and bookmarks grids set this to
   * `false` because the end-of-feed celebration reads as out of place in these
   * finite, library-style surfaces.
   */
  showEndMessage?: boolean;
  emptyState?: ReactNode;
  /**
   * Optional last grid cell (e.g. Add Content CTA on bookmarks/collection feeds).
   * Rendered after post cards inside the same grid. The cell uses `h-full` so the
   * tile stretches to a taller sibling in the row without imposing min-height.
   */
  trailingSlot?: ReactNode;
}
