export interface ReorderDraftEntry {
  /** Envelope item URI (`pubky://…`) — the stable sortable id. */
  uri: string;
  /** Composite `author:postId` for rendering, or `null` when the URI cannot be converted. */
  postId: string | null;
}

export interface UseReorderCollectionOptions {
  /** Composite collection id (`author:postId`). */
  compositeCollectionId: string;
  /** Live envelope `items` (ordered post URIs) from the page's `postDetails`. */
  envelopeItems: string[] | undefined;
}

export interface UseReorderCollectionResult {
  isReorderMode: boolean;
  isSaving: boolean;
  /** Draft order, one entry per envelope item (snapshot taken on enter). */
  draftEntries: ReorderDraftEntry[];
  enterReorder: () => void;
  /** Move the dragged item (`activeUri`) to the drop target's (`overUri`) index. */
  moveItem: (activeUri: string, overUri: string) => void;
  saveOrder: () => Promise<void>;
  cancelReorder: () => void;
}
