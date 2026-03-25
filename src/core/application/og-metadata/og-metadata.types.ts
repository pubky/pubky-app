/**
 * Input parameters for OG metadata fetching.
 * `url` comes from searchParams.get(), so it can be string or null.
 */
export interface TOgMetadataParams {
  url: string | null;
}

/**
 * Normalized OG metadata result.
 * For media URLs (image/video/audio), only `url` and `type` are set.
 * For websites, all fields are populated (title/image may be null if not found).
 */
export interface TOgMetadataResult {
  url: string;
  type: 'website' | 'image' | 'video' | 'audio';
  title?: string | null;
  image?: string | null;
}
