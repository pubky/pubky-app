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
       * Runs after the post is created with its composite id: performs the save
       * (add-to-collection / bookmark) and enqueues the optimistic feed insert.
       * Bound only on routes that save the newly-created post into the current feed.
       */
      onPostCreated?: (createdPostId: string) => Promise<void>;
    };
