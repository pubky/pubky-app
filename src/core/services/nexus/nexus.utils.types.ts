import { HttpMethod } from '@/libs/http/http.types';

/**
 * Parameters for building a Nexus URL with query string.
 * @see buildUrlWithQuery in nexus.utils.ts
 */
export type TBuildUrlWithQueryParams = {
  /** Base route path (e.g., 'post/123/details') */
  baseRoute: string;
  /** Object containing all parameters to potentially include in query string */
  params: Record<string, unknown>;
  /** Keys that are path parameters and should be excluded from query string */
  excludeKeys?: readonly string[];
};

/**
 * Parameters for creating fetch request options.
 * @see createFetchOptions in nexus.utils.ts
 */
export type TCreateFetchOptionsParams = {
  /** HTTP method (defaults to GET) */
  method?: HttpMethod;
  /** Request body as JSON string */
  body?: string | null;
};

/**
 * Parameters for raw fetch requests to Nexus API.
 * @see fetchNexus in nexus.utils.ts
 */
export type TFetchNexusParams = {
  /** Full API endpoint URL */
  url: string;
  /** HTTP method (defaults to GET) */
  method?: HttpMethod;
  /** Request body as JSON string */
  body?: string | null;
};

/**
 * Parameters for querying Nexus API with retry logic.
 * @see queryNexus in nexus.utils.ts
 */
export type TQueryNexusParams = {
  /** Revalidate even while the transport cache is fresh (TTL/notification refresh). */
  force?: boolean;
  /** Cache freshness in milliseconds; omit to use the shared default. */
  staleTime?: number;
  /**
   * 404 attempts allowed after the first for this query, overriding the shared Nexus
   * budget. Use it when a 404 is a verdict the user waits on (e.g. a profile lookup)
   * rather than a page or stream read that can absorb the indexing window. Only the
   * 404 budget changes; 5xx, 429 and non-retryable handling stay shared.
   */
  notFoundRetries?: number;
  /** Full API endpoint URL */
  url: string;
  /** HTTP method (defaults to GET) */
  method?: HttpMethod;
  /** Request body as JSON string */
  body?: string | null;
};
