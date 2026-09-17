export interface PostTagsPanelHandle {
  focus: () => void;
  /**
   * Brings the panel into view without focusing its input.
   *
   * `focus()` scrolled the panel into view as a side effect, so a mobile reveal that must not
   * raise the soft keyboard needs this instead of dropping the reveal action entirely.
   */
  reveal: () => void;
}

export interface PostTagsPanelProps {
  /** The composite post ID (format: authorId:postId) */
  postId: string;
  /** Width behavior for the tags panel */
  widthMode?: 'fit' | 'full';
  /** Auto-focus the tag input when it mounts (useful when the panel is conditionally rendered) */
  autoFocusInput?: boolean;
  /** Optional className for the container */
  className?: string;
  /** Whether to show a loading skeleton while fetching initial data. Defaults to true. */
  enableLoadingSkeleton?: boolean;
}
