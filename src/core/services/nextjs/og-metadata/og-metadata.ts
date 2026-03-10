import { queryNextjs } from '../nextjs.utils';
import { fetchOgMetadata } from './og-metadata.utils';
import type { TOgMetadataResult } from '@/core/application/og-metadata/og-metadata.types';

/**
 * Next.js OG Metadata Service
 *
 * Handles fetching OG metadata with caching and deduplication via queryNextjs.
 */
export class NextJsOgMetadataService {
  private constructor() {}

  /**
   * Fetches OG metadata for a validated URL.
   * Delegates caching, deduplication, and retry to the query client via queryNextjs.
   *
   * @param validatedUrl - Parsed and validated URL from the pipes layer
   * @returns Normalized OG metadata result
   */
  static async fetch(validatedUrl: URL): Promise<TOgMetadataResult> {
    const url = validatedUrl.toString();

    return queryNextjs({
      topic: 'og-metadata',
      url,
      queryFn: () => fetchOgMetadata(url, validatedUrl.hostname),
    });
  }
}
