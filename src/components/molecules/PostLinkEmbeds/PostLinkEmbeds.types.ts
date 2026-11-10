import type { EmbedData, EmbedProvider } from './Providers/Provider.types';

export type PostLinkEmbedsProps = {
  /** The post's text: its first link is embedded, with its plain website preview. */
  content?: string;
  /**
   * The link to embed, which wins over `content`: a post's stored web `embed`, or the composer's. Only
   * this link shows as the external resource card.
   */
  url?: string | null;
  /** The content is a post being written (the composer's preview), not a published post. */
  isComposing?: boolean;
};

export type ParseUrlForLinkEmbedResult = {
  embed: EmbedData | null;
  provider: EmbedProvider | null;
};
