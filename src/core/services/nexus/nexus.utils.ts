import { getCdnUrl, getNexusUrl } from '@/config/nexus';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, JSON_HEADERS } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { nexusQueryClient } from './nexus.query-client';
import type {
  TBuildUrlWithQueryParams,
  TCreateFetchOptionsParams,
  TFetchNexusParams,
  TQueryNexusParams,
} from './nexus.utils.types';

const FETCH_NEXUS_OPERATION = 'fetchNexus';

export function buildNexusUrl(endpoint: string): string {
  return `${getNexusUrl()}/${endpoint}`;
}

export function buildCdnUrl(endpoint: string): string {
  return `${getCdnUrl()}/${endpoint}`;
}

/**
 * Encodes a path segment to ensure safe URL construction
 * @param segment - The path segment to encode
 * @returns Encoded path segment safe for URL interpolation
 */
export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * Builds a Nexus URL with query parameters, excluding specified path parameter keys
 * @param baseRoute - The base route path (e.g., 'post/123/details')
 * @param params - Object containing all parameters
 * @param excludeKeys - Array of keys that are path parameters and should be excluded from query string
 * @returns Full Nexus URL with query parameters appended
 */
export function buildUrlWithQuery({ baseRoute, params, excludeKeys = [] }: TBuildUrlWithQueryParams): string {
  const queryParams = new URLSearchParams();

  // Add only query parameters (exclude path params)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && !excludeKeys.includes(key)) {
      queryParams.append(key, String(value));
    }
  });

  const queryString = queryParams.toString();
  const relativeUrl = queryString ? `${baseRoute}?${queryString}` : baseRoute;

  return buildNexusUrl(relativeUrl);
}

/**
 * Utility function to create fetch options with common headers.
 * Body must be a string (typically JSON.stringify'd) to ensure safe query key serialization.
 */
export function createFetchOptions({ method = HttpMethod.GET, body }: TCreateFetchOptionsParams = {}): RequestInit {
  const options: RequestInit = {
    method,
    headers: JSON_HEADERS,
  };

  if (body) options.body = body;

  return options;
}

/**
 * Raw fetch function without retry logic.
 * Used internally by queryNexus and for cases where retry is not desired.
 *
 * @param url - Full API endpoint URL
 * @param method - HTTP method (default: 'GET')
 * @param body - JSON string body (use JSON.stringify for objects)
 * @returns Parsed response data
 * @throws {NexusError} When response is not ok or JSON parsing fails
 */
export async function fetchNexus<T>({ url, method = HttpMethod.GET, body = null }: TFetchNexusParams): Promise<T> {
  const response = await safeFetch(
    url,
    createFetchOptions({ method, body }),
    ErrorService.Nexus,
    FETCH_NEXUS_OPERATION,
  );
  if (!response.ok) {
    throw httpResponseToError(response, ErrorService.Nexus, FETCH_NEXUS_OPERATION, url);
  }
  return parseResponseOrThrow<T>(response, ErrorService.Nexus, FETCH_NEXUS_OPERATION, url);
}

/** Like fetchNexus but for endpoints that return no body (e.g. PUT v0/ingest); throws on non-ok. */
export async function fetchNexusNoContent({ url, method }: Pick<TFetchNexusParams, 'url' | 'method'>): Promise<void> {
  const response = await safeFetch(url, createFetchOptions({ method }), ErrorService.Nexus, FETCH_NEXUS_OPERATION);
  if (!response.ok) {
    throw httpResponseToError(response, ErrorService.Nexus, FETCH_NEXUS_OPERATION, url);
  }
}

/**
 * Queries Nexus API with automatic retry logic via TanStack Query.
 * Body must be a string (typically JSON.stringify'd) to ensure proper cache key serialization.
 *
 * @param url - Full API endpoint URL
 * @param method - HTTP method (default: 'GET')
 * @param body - JSON string body (use JSON.stringify for objects)
 * @returns Parsed response data
 * @throws {NexusError} When response is not ok after all retries
 */
export async function queryNexus<T>({ url, method = HttpMethod.GET, body = null }: TQueryNexusParams): Promise<T> {
  return nexusQueryClient.fetchQuery({
    queryKey: ['nexus', url, method, body],
    queryFn: () => fetchNexus<T>({ url, method, body }),
  });
}

// --- In-flight dedupe for non-idempotent batch lookups ----------------------
//
// Sentry PUBKY-APP-B3/9X/AD/CT/CV: on cold cache-miss pages, several call sites
// (stream controller warm-up, per-post hooks, notification enrichment, repost
// backfill) each fire their own `POST /v0/stream/{posts,users}/by_ids` for the
// same ID sets within the same tick. TanStack's dedupe only sees one query
// client key per identical (url, method, body), so identical bodies racing in
// the same tick DO share a fetchQuery promise — but near-duplicates (same IDs,
// different viewer or ordering) do not, and the aggregate burst trips the
// nexus rate limiter's expensive-tier burst (40) on the first page load.
//
// This map coalesces in-flight requests by exact request identity. Unlike the
// TanStack cache it also removes the entry as soon as the request settles, so
// it never serves stale data; unlike fetchQuery it makes no guarantee beyond
// the current burst window, which is exactly the failure mode we saw.

const inFlightQueries = new Map<string, Promise<unknown>>();

function inFlightKey(url: string, method: HttpMethod, body: string | null): string {
  return `${method} ${url} ${body ?? ''}`;
}

/**
 * Runs `fetchNexus` but coalesces concurrent identical requests into one
 * network call. Use this instead of `queryNexus` for POST batch lookups that
 * are known to race (stream/posts/by_ids, stream/users/by_ids).
 */
export async function queryNexusDeduped<T>({
  url,
  method = HttpMethod.GET,
  body = null,
}: TQueryNexusParams): Promise<T> {
  const key = inFlightKey(url, method, body);
  const existing = inFlightQueries.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = nexusQueryClient
    .fetchQuery({
      queryKey: ['nexus', url, method, body],
      queryFn: () => fetchNexus<T>({ url, method, body }),
    })
    .finally(() => {
      inFlightQueries.delete(key);
    });

  inFlightQueries.set(key, promise);
  return promise;
}

export function clearInFlightQueriesForTest(): void {
  inFlightQueries.clear();
}
