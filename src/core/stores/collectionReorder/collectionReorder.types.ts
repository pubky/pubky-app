interface CollectionReorderState {
  /**
   * Composite id (`author:postId`) of the collection currently in reorder
   * mode, or `null` when no reorder is active. The producer (the single
   * collection page) and the consumer (the global FAB in the root layout) are
   * in different React trees, so this store is the channel that crosses that
   * boundary.
   */
  activeCollectionId: string | null;
}

interface CollectionReorderActions {
  /** Flag the given collection as being reordered. */
  enter: (collectionId: string) => void;
  /** Clear the reorder flag (on save, cancel, or page unmount). */
  exit: () => void;
}

export type CollectionReorderStore = CollectionReorderState & CollectionReorderActions;

export const collectionReorderInitialState: CollectionReorderState = {
  activeCollectionId: null,
};

export enum CollectionReorderActionTypes {
  ENTER = 'ENTER',
  EXIT = 'EXIT',
}
