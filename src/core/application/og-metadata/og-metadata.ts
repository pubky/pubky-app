import type { TOgMetadataFetchOutcome } from '@/application/og-metadata/og-metadata.types';
import { NextJsOgMetadataService } from '@/services/nextjs/og-metadata/og-metadata';

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
   * @returns Normalized OG metadata outcome
   * @throws AppError on DNS failure, blocked IP, fetch failure, or invalid content
   */
  static async fetch(validatedUrl: URL): Promise<TOgMetadataFetchOutcome> {
    return NextJsOgMetadataService.fetch(validatedUrl);
  }
}
