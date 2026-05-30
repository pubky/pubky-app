import type { TOgMetadataResult } from '@/application/og-metadata/og-metadata.types';
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
   * @returns Normalized OG metadata result. Expected enrichment failures return fallback metadata.
   * @throws AppError when the service surfaces a security/anomaly outcome
   * (blocked private IP, non-HTTP redirect, oversized body, redirect loop, or unexpected server error).
   */
  static async fetch(validatedUrl: URL): Promise<TOgMetadataResult> {
    return NextJsOgMetadataService.fetch(validatedUrl);
  }
}
