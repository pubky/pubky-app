export interface PostContentBaseProps {
  postId: string;
  className?: string;
  textClassName?: string;
  /**
   * Forwarded to kind-specific preview renders that need a contrast hint.
   * Used by the collection branch to pick `bg-muted` (subtle, default) vs
   * `bg-accent` (strong) based on how deeply this content is nested.
   */
  contrast?: 'subtle' | 'strong';
}
