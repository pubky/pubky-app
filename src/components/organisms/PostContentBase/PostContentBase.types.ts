export interface PostContentBaseProps {
  postId: string;
  className?: string;
  textClassName?: string;
  mediaVariant?: 'default' | 'list' | 'cards';
  /** The web link the post embeds (`embed`): previewed in place of the first link of its text. */
  embedUrl?: string | null;
  /**
   * The post this one quotes, shown under it (`PostContent`): when the text's first link is that post's
   * link on this host, the link is not previewed a second time.
   */
  quotedPostId?: string | null;
}
