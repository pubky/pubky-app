export interface PostContentBaseProps {
  postId: string;
  className?: string;
  textClassName?: string;
  mediaVariant?: 'default' | 'list' | 'cards';
  /** The web link the post embeds (`embed`): previewed in place of the first link of its text. */
  embedUrl?: string | null;
}
