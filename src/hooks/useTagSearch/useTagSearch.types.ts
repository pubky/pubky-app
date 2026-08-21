/**
 * Options for individual search operations
 */
export interface TagSearchOptions {
  /** Whether to add the tag to recent searches (default: false) */
  addToRecent?: boolean;
}

/**
 * Result from useTagSearch hook
 */
export interface UseTagSearchResult {
  /** Add a tag to current search (appends to existing tags) */
  addTagToSearch: (tag: string, options?: TagSearchOptions) => void;
  /** Remove a tag from current search */
  removeTagFromSearch: (tag: string) => void;
  /** Current active tags from store */
  activeTags: string[];
}
