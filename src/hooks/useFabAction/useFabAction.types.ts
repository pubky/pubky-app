import type { FeedInsertTarget } from '@/stores/feedOptimistic/feedOptimistic.types';

/**
 * The primary action the floating action button performs, resolved from the
 * current route + auth. Rendered directly by [`Fab`](src/components/molecules/Fab/Fab.tsx).
 */
export type FabAction =
  | {
      kind: 'createCollection';
      ariaLabel: string;
    }
  | {
      kind: 'createPost';
      ariaLabel: string;
      /**
       * Where the freshly created post should also be saved. Absent for the
       * default new-post action (home, non-owned collection, etc.).
       */
      saveTarget?: FeedInsertTarget;
      /**
       * Runs after the post is created with its composite id: performs the save
       * (add-to-collection / bookmark) and enqueues the optimistic feed insert.
       * Bound only when `saveTarget` is set.
       */
      onPostCreated?: (createdPostId: string) => Promise<void>;
    };
