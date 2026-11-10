import type { EmbedData, EmbedProvider, EmbedRenderOptions } from '../Provider.types';
import { GenericPreview } from './GenericPreview';
import { GenericResourcePreview } from './GenericResourcePreview';

/**
 * Generic embed provider
 * Implements the standard EmbedProvider interface
 * Uses client-side SWR for caching and deduplication
 */
export const Generic: EmbedProvider = {
  /**
   * This provider will support all domains not included in the others
   */
  domains: [],

  /**
   * Parse Generic URL and return embed information
   * Returns the URL immediately - fetching happens in the component with SWR
   */
  parseEmbed: (url: string): EmbedData => {
    // Just return the URL - the component will handle fetching with SWR
    return { type: 'url', value: url };
  },

  /**
   * Render the link a post embeds as an external resource card (when Pinakes is configured); a link
   * that is only in the post's text keeps the generic website preview
   */
  renderEmbed: (embedData: EmbedData, options?: EmbedRenderOptions) => {
    // Type guard: ensure we have a URL type
    if (embedData.type !== 'url') return null;

    if (!options?.isPostEmbed) return <GenericPreview url={embedData.value} />;

    return <GenericResourcePreview url={embedData.value} isComposing={options.isComposing} />;
  },
};
