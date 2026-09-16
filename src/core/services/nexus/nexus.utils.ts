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
 *
 * Content-Type is omitted on bodyless GETs: the header makes such requests
 * non-"simple", forcing a CORS preflight OPTIONS round trip for every call.
 * GETs have no body, so the header carries no information and only doubles
 * the request count. All other requests (bodies, non-simple methods) keep it.
 */
export function createFetchOptions({ method = HttpMethod.GET, body }: TCreateFetchOptionsParams = {}): RequestInit {
  const options: RequestInit = {
    method,
  };

  if (body) {
    options.body = body;
    options.headers = JSON_HEADERS;
  } else if (method !== HttpMethod.GET) {
    options.headers = JSON_HEADERS;
  }

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

const responseStartedAt = new WeakMap<object, number>();

/** Conservative snapshot cutoff; unknown/legacy responses carry no freshness proof. */
export function getNexusResponseStartedAt(response: object): number | undefined {
  return responseStartedAt.get(response);
}

/**
 * Forced revalidations whose network request has already started, keyed by serialized query
 * key.
 *
 * A forced caller must not receive data fetched before the event that forced it: that is
 * the shape of the rate-limited by_ids bursts (a notification refresh landing on a TTL
 * tick), and reusing the earlier request would stamp its response -- and the snapshot
 * built from it -- as evidence newer than the event. A caller that finds a forced request
 * already in flight therefore waits for it and starts a revalidation of its own.
 */
const inFlightForcedQueries = new Map<string, Promise<unknown>>();

/**
 * The forced revalidations that have not opened their network request yet -- one scheduled
 * per key, plus the single follow-up shared by the callers behind a running request.
 *
 * A scheduled revalidation starts its request after any caller that arrived before it did,
 * so those callers can share it: a burst of subscribers behind one pending request then
 * costs one request instead of one per caller (PUBKY-APP-B3). The moment the request
 * starts, the entry moves to `inFlightForcedQueries` and the run is no longer shareable --
 * a caller arriving after that needs a request started after its own call, not this one.
 */
const queuedForcedQueries = new Map<string, Promise<unknown>>();

/**
 * Queries Nexus API with automatic retry logic via TanStack Query.
 * Body must be a string (typically JSON.stringify'd) to ensure proper cache key serialization.
 *
 * @param url - Full API endpoint URL
 * @param method - HTTP method (default: 'GET')
 * @param body - JSON string body (use JSON.stringify for objects)
 * @param staleTime - Cache freshness in milliseconds; omit for the shared default
 * @param force - Revalidate after any request already in flight, overriding staleTime
 * @returns Parsed response data
 * @throws {NexusError} When response is not ok after all retries
 */
export async function queryNexus<T>({
  url,
  method = HttpMethod.GET,
  body = null,
  force = false,
  staleTime,
}: TQueryNexusParams): Promise<T> {
  const queryKey = ['nexus', url, method, body];

  const execute = async (): Promise<T> => {
    let startedAt: number | undefined;
    const data = await nexusQueryClient.fetchQuery({
      queryKey,
      ...(force ? { staleTime: 0 } : staleTime !== undefined ? { staleTime } : {}),
      queryFn: () => {
        startedAt = Date.now();
        return fetchNexus<T>({ url, method, body });
      },
    });
    // Record the returned reference after TanStack's structural sharing. Cached
    // and concurrent callers reuse this evidence rather than stamping a new time.
    if (startedAt !== undefined) {
      if (data !== null && typeof data === 'object') responseStartedAt.set(data, startedAt);
      const cached = nexusQueryClient.getQueryData(queryKey);
      if (cached !== null && typeof cached === 'object') responseStartedAt.set(cached, startedAt);
    }
    return data;
  };

  if (!force) return await execute();

  const forceKey = JSON.stringify(queryKey);

  const startRun = (): Promise<T> => {
    const waitForPending = (async () => {
      // staleTime alone still joins a request started before the invalidating event.
      // Wait for it, then revalidate behind it.
      const pending = nexusQueryClient.getQueryCache().find({ queryKey, exact: true });
      if (pending?.state.fetchStatus === 'fetching') await pending.promise?.catch(() => {});
    })();

    const run: Promise<T> = waitForPending
      .then(() => {
        // The network request begins here, and from now on this run is not shareable: a
        // caller arriving after this point needs a request started after its own call.
        if (queuedForcedQueries.get(forceKey) === run) queuedForcedQueries.delete(forceKey);
        inFlightForcedQueries.set(forceKey, run);
      })
      .then(() => execute());

    // Shareable until the request starts: every caller that arrives before it does is
    // still served by a request that begins after its own call.
    queuedForcedQueries.set(forceKey, run);
    const clear = () => {
      if (queuedForcedQueries.get(forceKey) === run) queuedForcedQueries.delete(forceKey);
      if (inFlightForcedQueries.get(forceKey) === run) inFlightForcedQueries.delete(forceKey);
    };
    run.then(clear, clear);
    return run;
  };

  // A revalidation that has not started yet is shared: its request will begin after this
  // caller's own event, so the data comes back fresh for this caller too, and callers that
  // arrive behind one pending ordinary request cost a single revalidation between them.
  const scheduled = queuedForcedQueries.get(forceKey) as Promise<T> | undefined;
  if (scheduled) return await scheduled;

  if (!inFlightForcedQueries.has(forceKey)) return await startRun();

  // A revalidation has started, and it began before this caller's event. Share one
  // follow-up behind it with the other waiters instead of handing back that older
  // response (which would come back stamped as fresh) or opening a request each.
  const followUp = inFlightForcedQueries
    .get(forceKey)!
    .catch(() => {})
    .then(() => {
      // Drop the shared slot as the follow-up starts: only the callers that queued behind
      // the request we just waited for share it.
      queuedForcedQueries.delete(forceKey);
      return startRun();
    });
  queuedForcedQueries.set(forceKey, followUp);
  const clearQueued = () => {
    if (queuedForcedQueries.get(forceKey) === followUp) queuedForcedQueries.delete(forceKey);
  };
  followUp.then(clearQueued, clearQueued);
  return await followUp;
}
