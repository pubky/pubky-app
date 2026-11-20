import type { ReactNode } from 'react';

/**
 * Discriminated union for embed data types
 * Each provider returns a specific type to ensure type safety
 */
export type EmbedData =
  | { type: 'url'; value: string } // YouTube, Vimeo, Generic (embed URLs)
  | { type: 'id'; value: string } // Twitter (tweet ID)
  | { type: 'post'; value: string }; // InApp (composite `author:postId`)

/** How the surrounding surface shows an embed. */
export interface EmbedRenderOptions {
  /**
   * The embed previews a post being written: nothing in it can be acted on yet, so an external
   * resource card leaves out its action row and tag bar.
   */
  isComposing?: boolean;
  /**
   * The link is the post's own embed, so the post points at that external resource: a generic link
   * shows as the external resource card. A link that is only in the post's text keeps the link's own
   * preview, since the post does not reference that resource.
   */
  isPostEmbed?: boolean;
  /**
   * Called when the platform says it cannot show the embed (a deleted X post): the resource's card
   * takes its place (`NativeEmbedResource`). Providers whose embed is an iframe cannot tell.
   */
  onEmbedError?: () => void;
  /** The embed fills the width of an external resource's frame or card at every size. */
  fill?: boolean;
}

/** What a platform embed is: a video plays in the card player, a post (an X post) shows in place. */
export type EmbedResourceKind = 'video' | 'post';

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
   * @param options - How the surrounding surface shows the embed
   * @returns ReactNode to render, or null if data type doesn't match
   */
  renderEmbed: (embedData: EmbedData, options?: EmbedRenderOptions) => ReactNode;

  /**
   * The platform's own embed of an external resource (`video`: YouTube, Vimeo; `post`: an X post):
   * as a post's embed it shows as that resource (`NativeEmbedResource`), the embed in the resource
   * frame or the resource's card. Absent for providers that are no platform embed.
   */
  resourceKind?: EmbedResourceKind;
}
