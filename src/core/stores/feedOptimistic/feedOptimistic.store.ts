import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  FeedOptimisticActionTypes,
  feedOptimisticInitialState,
  type FeedOptimisticStore,
} from './feedOptimistic.types';

/**
 * feedOptimistic store
 *
 * Bridges the layout↔page boundary for optimistic feed inserts. The FAB
 * ([`Fab`](src/components/molecules/Fab/Fab.tsx)) lives in the root layout,
 * outside any `TimelineFeed` provider, so it cannot call a feed's in-memory
 * `prependOptimisticPosts` directly. After creating a post and adding it to a
 * collection / bookmarks, the FAB enqueues the new id here; the already-mounted
 * feed consumes it via `useApplyPendingFeedInsert` and replays it into its own
 * `prependOptimisticPosts`.
 */
export const useFeedOptimisticStore = create<FeedOptimisticStore>()(
  devtools(
    (set) => ({
      ...feedOptimisticInitialState,

      enqueue: (key, postId) => {
        set(
          (state) => {
            const existing = state.pendingByKey[key] ?? [];
            if (existing.includes(postId)) {
              return state;
            }
            return { pendingByKey: { ...state.pendingByKey, [key]: [postId, ...existing] } };
          },
          false,
          FeedOptimisticActionTypes.ENQUEUE,
        );
      },

      clear: (key) => {
        set(
          (state) => {
            if (state.pendingByKey[key] === undefined) {
              return state;
            }
            const { [key]: _removed, ...rest } = state.pendingByKey;
            return { pendingByKey: rest };
          },
          false,
          FeedOptimisticActionTypes.CLEAR,
        );
      },
    }),
    {
      name: 'feed-optimistic-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
