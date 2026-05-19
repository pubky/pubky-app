import { CDN_URL, NEXUS_URL } from '@/config/nexus';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, JSON_HEADERS } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { nexusQueryClient } from './nexus.query-client';
import type {
  TBuildUrlWithQueryParams,
  TCreateFetchOptionsParams,
  TFetchNexusParams,
  TFetchNexusWithExpectedStatusParams,
  TQueryNexusParams,
  TQueryNexusWithExpectedStatusParams,
} from './nexus.utils.types';

export function buildNexusUrl(endpoint: string): string {
  return `${NEXUS_URL}/${endpoint}`;
}

export function buildCdnUrl(endpoint: string): string {
  return `${CDN_URL}/${endpoint}`;
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
  const response = await safeFetch(url, createFetchOptions({ method, body }), ErrorService.Nexus, 'fetchNexus');
  if (!response.ok) {
    throw httpResponseToError(response, ErrorService.Nexus, 'fetchNexus', url);
  }
  return parseResponseOrThrow<T>(response, ErrorService.Nexus, 'fetchNexus', url);
}

/**
 * Raw Nexus fetch with explicit HTTP status fallbacks.
 *
 * Use this only when a service method models a specific status as an expected
 * domain value. Expected statuses are returned before httpResponseToError runs,
 * so they also bypass the standard AppError/Sentry path by design.
 */
export async function fetchNexusWithExpectedStatus<T>({
  url,
  method = HttpMethod.GET,
  body = null,
  expectedStatusFallbacks,
}: TFetchNexusWithExpectedStatusParams<T>): Promise<T> {
  const response = await safeFetch(url, createFetchOptions({ method, body }), ErrorService.Nexus, 'fetchNexus');
  if (!response.ok) {
    if (Object.prototype.hasOwnProperty.call(expectedStatusFallbacks, response.status)) {
      return expectedStatusFallbacks[response.status] as T;
    }
    throw httpResponseToError(response, ErrorService.Nexus, 'fetchNexus', url);
  }
  return parseResponseOrThrow<T>(response, ErrorService.Nexus, 'fetchNexus', url);
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

/**
 * Queries Nexus while mapping explicit HTTP statuses to fallback domain values.
 *
 * Expected statuses do not use the normal Nexus retry behavior. This is an
 * intentional opt-in for endpoints where the first response already carries the
 * desired domain meaning.
 */
export async function queryNexusWithExpectedStatus<T>({
  url,
  method = HttpMethod.GET,
  body = null,
  expectedStatusFallbacks,
}: TQueryNexusWithExpectedStatusParams<T>): Promise<T> {
  const expectedStatusCodes = Object.keys(expectedStatusFallbacks).sort();
  return nexusQueryClient.fetchQuery({
    queryKey: ['nexus', url, method, body, 'expected-status', expectedStatusCodes],
    queryFn: () => fetchNexusWithExpectedStatus<T>({ url, method, body, expectedStatusFallbacks }),
  });
}
