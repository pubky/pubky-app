export interface PostTagsPanelProps {
  /** The composite post ID (format: authorId:postId) */
  postId: string;
  /** Width behavior for the tags panel */
  widthMode?: 'fit' | 'full';
  /** Optional className for the container */
  className?: string;
}
