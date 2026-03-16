import * as Core from '@/core';

/**
 * Controller for OG metadata fetching.
 * Entry point for the OG metadata feature, called from the API route.
 */
export class OgMetadataController {
  private constructor() {}

  /**
   * Fetch OG metadata for a URL.
   *
   * Validates the URL via pipes layer, then delegates to the application layer
   * for DNS resolution, fetching, parsing, and SSRF protection.
   *
   * @param params.url - Raw URL string from the request (may be null)
   * @returns Normalized OG metadata result
   * @throws AppError if validation fails or fetching fails
   */
  static async fetch(params: Core.TOgMetadataParams): Promise<Core.TOgMetadataResult> {
    // Validate and parse URL using pipes layer
    const validatedUrl = await Core.OgMetadataValidators.validate(params.url);

    // Delegate to application layer
    return Core.OgMetadataApplication.fetch(validatedUrl);
  }
}
