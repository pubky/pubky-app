/**
 * Identifies the finite, membership-ordered feed an optimistic post should be
 * inserted into. Mirrors the shape used by `AddContentDialog`'s target so the
 * FAB and the in-feed "Add content" flow speak the same language.
 */
export type FeedInsertTarget =
  | {
      type: 'bookmarks';
    }
  | {
      type: 'collection';
      /** Collection composite id (`author:postId`). */
      collectionId: string;
    };

interface FeedOptimisticState {
  /**
   * Post ids waiting to be optimistically prepended, keyed by feed identity
   * (see `buildFeedKey`). The producer (the global FAB) and the consumer (the
   * page-level feed) are in different React trees, so this store is the only
   * channel that crosses that boundary.
   */
  pendingByKey: Record<string, string[] | undefined>;
}

interface FeedOptimisticActions {
  /** Queue a freshly created post id for the given feed key. */
  enqueue: (key: string, postId: string) => void;
  /** Drop all pending ids for the given feed key (after they are applied). */
  clear: (key: string) => void;
}

export type FeedOptimisticStore = FeedOptimisticState & FeedOptimisticActions;

export const feedOptimisticInitialState: FeedOptimisticState = {
  pendingByKey: {},
};

export enum FeedOptimisticActionTypes {
  ENQUEUE = 'ENQUEUE',
  CLEAR = 'CLEAR',
}

/**
 * Builds the stable key both sides agree on. Keyed by feed identity (not stream
 * id) because the bookmarks stream id varies with the active sort/content
 * filters, while the feed itself is stable.
 */
export function buildFeedKey(target: FeedInsertTarget): string {
  switch (target.type) {
    case 'bookmarks':
      return 'bookmarks';
    case 'collection':
      return `collection:${target.collectionId}`;
    default: {
      const exhaustiveCheck: never = target;
      return exhaustiveCheck;
    }
  }
}
