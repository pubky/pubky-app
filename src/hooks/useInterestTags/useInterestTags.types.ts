export interface UseInterestTagsResult {
  /**
   * Ordered, deduped, canonical (trimmed, lowercase) selection. Order is selection
   * order — it becomes the starter pack stream ID order downstream (#2388).
   */
  selectedTags: string[];
  /** Adds a canonicalized tag if valid, not already selected, and below the cap. */
  addTag: (raw: string) => void;
  /** Removes a tag (input canonicalized before matching). */
  removeTag: (raw: string) => void;
  /** Adds when unselected, removes when selected. */
  toggleTag: (raw: string) => void;
  /** Whether the canonicalized form of the given label is selected. */
  isSelected: (raw: string) => boolean;
  /** Whether the selection reached the starter pack tag cap. */
  isAtLimit: boolean;
}
