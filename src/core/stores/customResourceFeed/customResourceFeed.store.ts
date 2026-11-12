import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  CustomResourceFeedActionTypes,
  customResourceFeedInitialState,
  type CustomResourceFeedStore,
} from './customResourceFeed.types';

/**
 * customResourceFeed store
 *
 * Whether a custom feed of external resources opened with its saved types and filters in the URL
 * (`useSeedCustomResourceFeed`). The list writes them; the filter panel, in the layout outside the
 * page's React tree, shows Search's filters only once they are in, and the list searches only then.
 */
export const useCustomResourceFeedStore = create<CustomResourceFeedStore>()(
  devtools(
    (set) => ({
      ...customResourceFeedInitialState,

      write: (feedId, search, savedParams = []) => {
        set(
          { readyFeedId: null, pending: { feedId, search }, savedParams },
          false,
          CustomResourceFeedActionTypes.WRITE,
        );
      },

      ready: (feedId, savedParams = []) => {
        set({ readyFeedId: feedId, pending: null, savedParams }, false, CustomResourceFeedActionTypes.READY);
      },

      reset: () => {
        set(customResourceFeedInitialState, false, CustomResourceFeedActionTypes.RESET);
      },
    }),
    {
      name: 'custom-resource-feed-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
