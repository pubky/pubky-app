import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  CollectionReorderActionTypes,
  collectionReorderInitialState,
  type CollectionReorderStore,
} from './collectionReorder.types';

/**
 * collectionReorder store
 *
 * Bridges the layout↔page boundary for collection reorder mode. The FAB
 * ([`Fab`](src/components/molecules/Fab/Fab.tsx)) lives in the root layout,
 * outside the collection page's React tree, so it cannot receive a prop when
 * the page enters reorder mode. The page raises this flag on enter and clears
 * it on save/cancel/unmount; the FAB hides itself while it is set. The draft
 * order itself stays local to the page (`useReorderCollection`).
 */
export const useCollectionReorderStore = create<CollectionReorderStore>()(
  devtools(
    (set) => ({
      ...collectionReorderInitialState,

      enter: (collectionId) => {
        set({ activeCollectionId: collectionId }, false, CollectionReorderActionTypes.ENTER);
      },

      exit: () => {
        set({ activeCollectionId: null }, false, CollectionReorderActionTypes.EXIT);
      },
    }),
    {
      name: 'collection-reorder-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
