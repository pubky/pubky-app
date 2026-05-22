import { OgMetadataApplication } from '@/application/og-metadata/og-metadata';
import type { TOgMetadataParams, TOgMetadataResult } from '@/application/og-metadata/og-metadata.types';
import { OgMetadataValidators } from '@/pipes/og-metadata/og-metadata.validators';

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
  static async fetch(params: TOgMetadataParams): Promise<TOgMetadataResult> {
    // Validate and parse URL using pipes layer
    const validatedUrl = await OgMetadataValidators.validate(params.url);

    // Delegate to application layer
    return OgMetadataApplication.fetch(validatedUrl);
  }
}
