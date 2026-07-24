import type { ReactNode } from 'react';

/**
 * Discriminated union for embed data types
 * Each provider returns a specific type to ensure type safety
 */
export type EmbedData =
  | { type: 'url'; value: string } // YouTube, Vimeo, Generic (embed URLs)
  | { type: 'id'; value: string } // Twitter (tweet ID)
  | { type: 'post'; value: string }; // InApp (composite `author:postId`)

/**
 * Standard interface that all embed providers must implement
 */
export interface EmbedProvider {
  /**
   * List of supported domains for this provider (lowercase)
   * Used for O(1) hostname-to-provider lookup
   */
  domains: readonly string[];

  /**
   * Parse URL and return embed information
   * Returns null if URL is not valid for this provider
   *
   * @param url - The URL to parse
   * @returns EmbedData with type discriminator, or null if invalid
   */
  parseEmbed: (url: string) => EmbedData | null;

  /**
   * Render the embed component for this provider
   *
   * @param embedData - The embed data with type discriminator
   * @returns ReactNode to render, or null if data type doesn't match
   */
  renderEmbed: (embedData: EmbedData) => ReactNode;
}
