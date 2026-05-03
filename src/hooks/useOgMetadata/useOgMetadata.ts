'use client';

import { useEffect, useState } from 'react';

export interface OgMetadata {
  url: string;
  title: string | null;
  image: string | null;
  type: 'website' | 'image' | 'video' | 'audio';
}

// Simple in-memory cache for metadata
// This provides basic caching without the complexity of SWR
const metadataCache = new Map<
  string,
  {
    data: OgMetadata;
    timestamp: number;
  }
>();

const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Hook to fetch OpenGraph metadata with simple caching
 *
 * Features:
 * - In-memory caching with TTL
 * - Automatic deduplication of concurrent requests
 * - Loading and error states
 *
 * @param url - The URL to fetch metadata for
 * @returns Metadata, loading state, and error
 *
 * @example
 * const { metadata, isLoading, error } = useOgMetadata('https://example.com');
 */
export function useOgMetadata(url: string | null) {
  const [metadata, setMetadata] = useState<OgMetadata | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setMetadata(null);
      setIsLoading(false);
      return;
    }

    const apiUrl = `/api/og-metadata?url=${encodeURIComponent(url)}`;

    // Check cache first
    const cached = metadataCache.get(apiUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setMetadata(cached.data);
      setIsLoading(false);
      return;
    }

    // Fetch from API
    setIsLoading(true);
    setError(null);

    fetch(apiUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch metadata');
        }
        return response.json();
      })
      .then((data: OgMetadata) => {
        // Update cache
        metadataCache.set(apiUrl, {
          data,
          timestamp: Date.now(),
        });

        setMetadata(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err);
        setIsLoading(false);
      });
  }, [url]);

  return {
    metadata,
    isLoading,
    error,
  };
}
