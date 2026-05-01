import type { EmbedData, EmbedProvider } from './Providers/Provider.types';

export type PostLinkEmbedsProps = {
  content: string;
};

export type ParseUrlForLinkEmbedResult = {
  embed: EmbedData | null;
  provider: EmbedProvider | null;
};
