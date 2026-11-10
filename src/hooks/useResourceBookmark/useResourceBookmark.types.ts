export interface UseResourceBookmarkOptions {
  /** Whether to read the bookmark (the save picker is open); defaults to `true`. */
  active?: boolean;
  /** Other spellings of the link: a bookmark of any of them is the link's. */
  spellings?: readonly string[];
}

export interface UseResourceBookmarkResult {
  /** The viewer's own bookmark state; `false` while signed out or loading. */
  isBookmarked: boolean;
  isLoading: boolean;
  isToggling: boolean;
  /** Bookmark or un-bookmark; resolves `true` when the write went through. */
  toggle: () => Promise<boolean>;
}
