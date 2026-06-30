export interface PostPreviewCardProps {
  /** Post ID to display */
  postId: string;
  /** Optional className applied to the outer Card wrapper */
  className?: string;
  /**
   * Contrast hint forwarded to kind-specific preview renders inside the card
   * (currently only collections use it). Default `'subtle'` is right when the
   * preview card is itself the deepest surface; pass `'strong'` from callers
   * that wrap it in additional card layers (e.g. timeline reposts).
   */
  contrast?: 'subtle' | 'strong';
}
