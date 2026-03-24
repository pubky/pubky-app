export interface PostTagsPanelHandle {
  focus: () => void;
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
