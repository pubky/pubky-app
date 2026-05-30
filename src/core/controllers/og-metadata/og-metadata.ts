import { OgMetadataApplication } from '@/application/og-metadata/og-metadata';
import type { TOgMetadataParams } from '@/application/og-metadata/og-metadata.types';
import { OgMetadataValidators } from '@/pipes/og-metadata/og-metadata.validators';
import type { TOgMetadataControllerResult } from './og-metadata.types';

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
   * @returns Controller result with validation failure or normalized OG metadata
   * @throws AppError when the application layer surfaces a security/anomaly outcome
   * (blocked private IP, non-HTTP redirect, oversized body, redirect loop, or unexpected server error).
   */
  static async fetch(params: TOgMetadataParams): Promise<TOgMetadataControllerResult> {
    // Validate and parse URL using pipes layer
    const validation = await OgMetadataValidators.validateSafe(params.url);
    if (!validation.ok) {
      return { ok: false, message: validation.message, statusCode: validation.statusCode };
    }

    // Delegate to application layer
    return { ok: true, metadata: await OgMetadataApplication.fetch(validation.url) };
  }
}
