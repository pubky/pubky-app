interface PostInputLinkEmbedBaseProps {
  /** Whether the button is disabled (while the post is being published). */
  disabled?: boolean;
}

export interface PostInputLinkEmbedEmbeddedProps extends PostInputLinkEmbedBaseProps {
  /** The web link the post will embed. */
  url: string;
  isRemoved?: false;
  /** Removes the embed; the link stays in the text. */
  onRemove: () => void;
  /**
   * The text's links that can be embedded, in order (`url` among them). With more than one, the line
   * holds a Switch menu listing them, `url` checked; the post embeds only one.
   */
  choices?: readonly string[];
  /** Embeds `link` instead of `url`. */
  onPick?: (link: string) => void;
}

export interface PostInputLinkEmbedRemovedProps extends PostInputLinkEmbedBaseProps {
  /** The author removed the embed: only a line saying so, with the button that embeds the link again. */
  isRemoved: true;
  /** Embeds the removed link again. */
  onRestore: () => void;
}

export type PostInputLinkEmbedProps = PostInputLinkEmbedEmbeddedProps | PostInputLinkEmbedRemovedProps;
