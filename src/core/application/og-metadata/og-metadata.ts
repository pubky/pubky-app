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
   * In-flight coalescing. The OG route is CDN-cached, but crawlers and
   * multi-tab users still reach this handler with several concurrent
   * requests for the same URL before any response is cacheable, and each
   * did a full DNS check + remote fetch (PUBKY-APP-60 "Inefficient HTTP
   * Requests"). Concurrent identical URLs now share one fetch.
   */
  private static readonly inFlight = new Map<string, Promise<TOgMetadataResult>>();

  /**
   * Fetch and extract OG metadata from a validated URL.
   *
   * @param validatedUrl - Parsed and validated URL from the pipes layer
   * @returns Normalized OG metadata result. Expected enrichment failures return fallback metadata.
   * @throws AppError when the service surfaces a security/anomaly outcome
   * (blocked private IP, non-HTTP redirect, oversized body, redirect loop, or unexpected server error).
   */
  static async fetch(validatedUrl: URL): Promise<TOgMetadataResult> {
    const key = validatedUrl.toString();
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = NextJsOgMetadataService.fetch(validatedUrl).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }
}
