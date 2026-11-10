export type CollectionSaveTarget = {
  id: string;
  name: string;
  description: string;
  isSaved: boolean;
  isUpdating: boolean;
};

export interface UseCollectionSaveTargetsParams {
  /** The item's spellings; a new collection gets the first. */
  itemUris: readonly string[];
  /** Drives collection pagination: the picker loads more pages only while open. */
  isPickerOpen: boolean;
  /** Scopes the sign-in wait (`useRequireAuth`); an inactive owner never writes. */
  active?: boolean;
  /** Adds the item to the collection (`shouldAdd`) or removes it. */
  commitToggle: (collectionId: string, shouldAdd: boolean) => Promise<void>;
  /** Static success copy per item kind (no user text). */
  messages: { added: string; removed: string; created: string };
  /** Where failures are logged from, and the ids that name the item. */
  logContext: { source: string; ids: Record<string, string> };
}

export interface UseCollectionSaveTargetsResult {
  collections: CollectionSaveTarget[];
  isCollectionsLoading: boolean;
  isCreatingCollection: boolean;
  hasMoreCollections: boolean;
  isCollectionsLoadingMore: boolean;
  loadMoreCollections: () => Promise<void>;
  toggleCollection: (collectionId: string) => Promise<boolean>;
  createCollectionWithItem: (name: string) => Promise<boolean>;
}
