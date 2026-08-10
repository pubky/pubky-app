import type { ReorderDraftEntry } from '@/hooks/useReorderCollection/useReorderCollection.types';

export interface CollectionReorderGridProps {
  /** Draft entries in their current drafted order. */
  entries: ReorderDraftEntry[];
  /** Move the dragged URI to the drop target URI's index. */
  onMove: (activeUri: string, overUri: string) => void;
  /** Disables all sortables (while the save commit is in flight). */
  disabled?: boolean;
}

export interface CollectionReorderCardProps {
  entry: ReorderDraftEntry;
  disabled?: boolean;
}
