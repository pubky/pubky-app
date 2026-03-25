import * as Core from '@/core';

/**
 * OG metadata application service.
 *
 * Delegates OG metadata fetching to the NextJs OG Metadata service,
 * which handles DNS validation, redirect following, content parsing,
 * caching, deduplication, and retry.
 */
export class OgMetadataApplication {
  private constructor() {}

  /**
   * Fetch and extract OG metadata from a validated URL.
   *
   * @param validatedUrl - Parsed and validated URL from the pipes layer
   * @returns Normalized OG metadata result
   * @throws AppError on DNS failure, blocked IP, fetch failure, or invalid content
   */
  static async fetch(validatedUrl: URL): Promise<Core.TOgMetadataResult> {
    return Core.NextJsOgMetadataService.fetch(validatedUrl);
  }
}
