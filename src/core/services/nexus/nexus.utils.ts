import {
  INDEXER_HINT_BACKFILL_PAGES,
  INDEXER_PAGE_BACKFILL_AUTHORS,
  INDEXER_PAGE_BACKFILL_IDLE_ROUNDS,
} from '@/config/indexer';
import {
  getCdnUrl,
  getNexusUrl,
  getV1CdnUrl,
  hasLocalIndexSource,
  hasNexusSource,
  NEXUS_API_VERSION,
} from '@/config/nexus';
import type { AppError } from '@/libs/error/error';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError, httpStatusCodeToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode, JSON_HEADERS } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import type { NexusRequest, NexusResponse } from '@/libs/indexer/social/nexusRouter';
import { InvalidQueryError, UnavailableQueryError } from '@/libs/indexer/social/queries/queries.errors';
import type { MoreHint } from '@/libs/indexer/social/queries/queries.types';
import { SOCIAL_ACTIVITY } from '@/libs/indexer/social/social.domain';
import type { SocialIndexer } from '@/libs/indexer/social/socialIndexer';
import { Logger } from '@/libs/logger/logger';
import { NEXUS_LOCAL_INDEX_OPERATION } from '@/libs/observability/sentry.constants';
import { IndexerService } from '@/services/indexer/indexer';
import { nexusQueryClient, nexusRetryPolicy } from './nexus.query-client';
import type {
  TBuildNexusUrlOptions,
  TBuildUrlWithQueryParams,
  TCreateFetchOptionsParams,
  TFetchNexusParams,
  TQueryNexusParams,
} from './nexus.utils.types';

const FETCH_NEXUS_OPERATION = 'fetchNexus';

/**
 * The origin of Nexus URLs when a deploy without the nexus source leaves the Nexus URL unset. The local index routes on
 * the path alone, and `.invalid` never resolves: a URL that reached the network fails there, where a relative path
 * would have hit this app.
 */
const UNSET_NEXUS_ORIGIN = 'https://nexus.invalid';

/**
 * Builds a Nexus API URL: `{nexus}/{version}/{endpoint}`, with `endpoint` spelled without a version.
 * Every call uses `NEXUS_API_VERSION`; the one documented `/v0` call passes its version explicitly.
 */
export function buildNexusUrl(endpoint: string, { version = NEXUS_API_VERSION }: TBuildNexusUrlOptions = {}): string {
  return `${getNexusUrl() ?? UNSET_NEXUS_ORIGIN}/${version}/${endpoint}`;
}

/** The CDN bases exist whenever Nexus is a source; a media URL without one would point at the app's own origin. */
function requireCdnBase(base: string | undefined, operation: string): string {
  if (base !== undefined) return base;
  throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'No CDN URL is configured without the nexus source', {
    service: ErrorService.Nexus,
    operation,
  });
}

export function buildCdnUrl(endpoint: string): string {
  return `${requireCdnBase(getCdnUrl(), 'buildCdnUrl')}/${endpoint}`;
}

export function buildV1CdnUrl(endpoint: string): string {
  return `${requireCdnBase(getV1CdnUrl(), 'buildV1CdnUrl')}/${endpoint}`;
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
  // Without the nexus source `buildNexusUrl` spells a bare path for the local index; fetched, it would hit this app.
  if (!hasNexusSource()) {
    throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Nexus is not an indexer source', {
      service: ErrorService.Nexus,
      operation: FETCH_NEXUS_OPERATION,
      context: { endpoint: url },
    });
  }
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

/**
 * Like fetchNexus but for endpoints that return no body (e.g. PUT ingest/{id}); throws on non-ok. Without Nexus
 * among the sources there is nobody to tell: the local index crawls what it needs itself.
 */
export async function fetchNexusNoContent({ url, method }: Pick<TFetchNexusParams, 'url' | 'method'>): Promise<void> {
  if (!hasNexusSource()) return;
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

/** Carries a start time onto a response assembled from several Nexus responses. */
export function markNexusResponseStartedAt(response: object, startedAt: number): void {
  responseStartedAt.set(response, startedAt);
}

/**
 * Carries the start time of `response` onto `derived`, the same response as the read boundary
 * mapped it (local post kinds, derived tag `relationship`), and returns `derived`. A response
 * without a stamp leaves `derived` without one.
 */
export function carryNexusResponseStartedAt<T extends object>(response: object, derived: T): T {
  const startedAt = responseStartedAt.get(response);
  if (startedAt !== undefined) responseStartedAt.set(derived, startedAt);
  return derived;
}

/** Maps every item of a Nexus list response through the read boundary, keeping the response's start time. */
export function mapNexusResponse<T, U>(response: T[], map: (item: T) => U): U[] {
  return carryNexusResponseStartedAt(response, response.map(map));
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

/** Retry budgets are part of query identity because the first caller owns the retryer. */
export function buildNexusQueryKey({
  url,
  method = HttpMethod.GET,
  body = null,
  notFoundRetries,
}: Pick<TQueryNexusParams, 'url' | 'method' | 'body' | 'notFoundRetries'>) {
  return ['nexus', url, method, body, ...(notFoundRetries === undefined ? [] : [{ notFoundRetries }])];
}

type LocalIndexAnswer =
  | { kind: 'answer'; json: unknown }
  /** `known` when the index proves the absence: the history that would hold the post or user is loaded. */
  | { kind: 'not_found'; known: boolean }
  | { kind: 'unavailable'; reason: string };

const LOCAL_INDEX_METHODS: Partial<Record<HttpMethod, NexusRequest['method']>> = {
  [HttpMethod.GET]: 'GET',
  [HttpMethod.POST]: 'POST',
  [HttpMethod.PUT]: 'PUT',
};

/** A read about one post or one user, as opposed to a stream, a search or a ranking. */
const isOneEntityRead = (url: string): boolean =>
  new RegExp(`/${NEXUS_API_VERSION}/(?:post|user)/`).test(new URL(url, 'http://local.invalid').pathname);

/**
 * `force` skips the index's rate limit on an author's older history. A stream page asks for it once per scroll, and
 * a load skipped there would serve a short page, which ends the feed.
 */
function startHintLoad(indexer: SocialIndexer, hint: MoreHint, force: boolean): Promise<unknown> {
  switch (hint.kind) {
    case 'user':
      return indexer.ensureUser(hint.user);
    case 'post':
      return indexer.ensurePost(hint.author, hint.postId);
    case 'backfill':
      return indexer.backfill(hint.author, SOCIAL_ACTIVITY, INDEXER_HINT_BACKFILL_PAGES, { force });
  }
}

/** Loads one hint, logging how long the read waited for it. */
async function loadHint(indexer: SocialIndexer, hint: MoreHint, force = false): Promise<void> {
  const startedAt = Date.now();
  try {
    await startHintLoad(indexer, hint, force);
  } finally {
    Logger.debug('Local index loaded on demand', { hint, ms: Date.now() - startedAt });
  }
}

/**
 * The hints worth one load before asking again. A user or post the answer lacks is always loaded: the app reads one
 * post or user through `by_ids` and a profile's posts through its author stream, and each answers without it rather
 * than with a 404. Older history only for a 404 the index cannot vouch for or a read about one post or user; a
 * stream page gets it from `extendStreamPage`.
 */
function hintsToLoad(more: readonly MoreHint[], url: string, unproven: boolean): MoreHint[] {
  const extendsHistory = unproven || isOneEntityRead(url);
  return more.filter((hint) => hint.kind !== 'backfill' || extendsHistory);
}

const STREAM_PAGE_PATH = new RegExp(`/${NEXUS_API_VERSION}/stream/posts/keys$`);

/**
 * The page size of a post stream page that older history can extend, `null` for any other read. A page bounded from
 * below (`end`) asks for posts newer than a score, as a head poll does, which no older post can join.
 */
function extendablePageLimit(url: string): number | null {
  const parsed = new URL(url, 'http://local.invalid');
  if (!STREAM_PAGE_PATH.test(parsed.pathname) || parsed.searchParams.has('end')) return null;
  const limit = Number(parsed.searchParams.get('limit'));
  return Number.isInteger(limit) && limit > 0 ? limit : null;
}

const pageKeysOf = (response: NexusResponse): readonly unknown[] | null => {
  if (response.status !== 200) return null;
  const keys = (response.json as { post_keys?: unknown } | null)?.post_keys;
  return Array.isArray(keys) ? keys : null;
};

/**
 * The authors a short page loads older history for, at most `INDEXER_PAGE_BACKFILL_AUTHORS`: those whose loaded
 * history starts latest, whose gap the page reached first. An author with no known start goes first.
 */
function authorsToExtend(indexer: SocialIndexer, more: readonly MoreHint[]): string[] {
  const authors = [...new Set(more.flatMap((hint) => (hint.kind === 'backfill' ? [hint.author] : [])))];
  const view = indexer.view();
  const startOf = (author: string) => view.historyOf(author).sinceMs ?? Number.POSITIVE_INFINITY;
  return authors
    .map((author) => ({ author, since: startOf(author) }))
    .sort((a, b) => (a.since === b.since ? 0 : a.since > b.since ? -1 : 1))
    .slice(0, INDEXER_PAGE_BACKFILL_AUTHORS)
    .map(({ author }) => author);
}

/**
 * Keeps loading older history into a stream page that came back short while its answer names authors whose history
 * is not complete, one step per author and round, and asks again after each round. The app reads a short page as
 * the end of the feed, so the page is served short only when no author has older history left, when every load of
 * a round failed, or after `INDEXER_PAGE_BACKFILL_IDLE_ROUNDS` rounds in a row that added no post. A full page is
 * served as it came, so a feed's first page waits for nothing it does not show.
 */
async function extendStreamPage(
  indexer: SocialIndexer,
  request: NexusRequest,
  first: NexusResponse,
  limit: number,
): Promise<NexusResponse> {
  let response = first;
  let idleRounds = 0;
  for (;;) {
    const keys = pageKeysOf(response);
    if (keys === null || keys.length >= limit) return response;
    const authors = authorsToExtend(indexer, response.more ?? []);
    if (authors.length === 0) return response;
    const loads = await Promise.allSettled(
      authors.map((author) => loadHint(indexer, { kind: 'backfill', author }, true)),
    );
    if (loads.every(({ status }) => status === 'rejected')) return response;
    const next = await indexer.request(request);
    const seen = new Set(keys);
    idleRounds = (pageKeysOf(next) ?? []).some((key) => !seen.has(key)) ? 0 : idleRounds + 1;
    response = next;
    if (idleRounds >= INDEXER_PAGE_BACKFILL_IDLE_ROUNDS) return response;
  }
}

/**
 * Answers a Nexus read from the local index. When the answer names what could be loaded to improve it
 * (`hintsToLoad`), that is loaded once and the read asked once more; a short post stream page then gets older
 * history until it is full or proven to end (`extendStreamPage`). A route the index cannot serve (global search
 * and rankings, and for a signed-out visitor's index every feed, ranking and search over a scope it does not have)
 * is `unavailable`.
 */
async function askLocalIndex({
  url,
  method = HttpMethod.GET,
  body = null,
}: TQueryNexusParams): Promise<LocalIndexAnswer> {
  const indexer = IndexerService.current();
  const routedMethod = LOCAL_INDEX_METHODS[method];
  if (!indexer) return { kind: 'unavailable', reason: 'no local index runs here' };
  if (!routedMethod) return { kind: 'unavailable', reason: `${method} is not a read` };
  const request: NexusRequest = { url, method: routedMethod, body: body ?? undefined };
  try {
    let response = await indexer.request(request);
    const unproven = response.status === 404 && response.coverage.kind !== 'exact';
    const hints = hintsToLoad(response.more ?? [], url, unproven);
    if (hints.length > 0) {
      // A hint that fails to load leaves the second answer as it was.
      await Promise.allSettled(hints.map((hint) => loadHint(indexer, hint)));
      response = await indexer.request(request);
    }
    const pageLimit = method === HttpMethod.GET ? extendablePageLimit(url) : null;
    if (pageLimit !== null) response = await extendStreamPage(indexer, request, response, pageLimit);
    if (response.status === 200) return { kind: 'answer', json: response.json };
    return { kind: 'not_found', known: response.coverage.kind === 'exact' };
  } catch (error) {
    if (error instanceof UnavailableQueryError) return { kind: 'unavailable', reason: error.message };
    const context = { endpoint: url, statusCode: HttpStatusCode.BAD_REQUEST };
    if (error instanceof InvalidQueryError) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, error.message, {
        service: ErrorService.Nexus,
        operation: NEXUS_LOCAL_INDEX_OPERATION,
        context,
      });
    }
    throw toAppError(error, ErrorService.Nexus, NEXUS_LOCAL_INDEX_OPERATION, { context: { endpoint: url } });
  }
}

/**
 * The error a miss of the local index raises: a 404 is the one a Nexus 404 raises, so not-found handling applies
 * unchanged, and a read the index cannot serve is a 422, which no retry policy repeats. Both are expected outcomes
 * and stay out of Sentry (`local-index-misses`).
 */
function localIndexMissError(miss: Exclude<LocalIndexAnswer, { kind: 'answer' }>, url: string): AppError {
  if (miss.kind === 'not_found') {
    return httpStatusCodeToError(
      HttpStatusCode.NOT_FOUND,
      'Not found in the local index',
      ErrorService.Nexus,
      NEXUS_LOCAL_INDEX_OPERATION,
      url,
    );
  }
  return Err.client(ClientErrorCode.UNPROCESSABLE, `The local index cannot answer this read: ${miss.reason}`, {
    service: ErrorService.Nexus,
    operation: NEXUS_LOCAL_INDEX_OPERATION,
    context: { endpoint: url, statusCode: HttpStatusCode.UNPROCESSABLE_ENTITY },
  });
}

/**
 * Answers a Nexus read from the configured sources (`PUBKY_RUNTIME_INDEXER_SOURCES`), in order:
 * - `nexus`: Nexus, through {@link queryRemoteNexus}.
 * - `local`: the local index alone. Its answer has no transport cache, retries or start stamp: it is read from the
 *   index's current view, which reflects homeserver state as of its last sync, not as of this call, so it carries
 *   no proof of freshness for the tag guards (`getNexusResponseStartedAt` reads `undefined`). The answer's `asOf`
 *   is no such proof either: it is when the last scope sync ended, while a homeserver that failed or backed off in
 *   it, and anything loaded on demand, can be older.
 * - `local,nexus`: the local index, then Nexus for a read the index cannot serve or a 404 it cannot vouch for.
 *
 * Body must be a string (typically JSON.stringify'd) to ensure proper cache key serialization.
 */
export async function queryNexus<T>(params: TQueryNexusParams): Promise<T> {
  if (!hasLocalIndexSource()) return await queryRemoteNexus<T>(params);
  const local = await askLocalIndex(params);
  // The index answers in Nexus's response shape.
  if (local.kind === 'answer') return local.json as T;
  const nexusMayKnow = local.kind === 'unavailable' || !local.known;
  if (nexusMayKnow && hasNexusSource()) return await queryRemoteNexus<T>(params);
  throw localIndexMissError(local, params.url);
}

/**
 * Queries Nexus API with automatic retry logic via TanStack Query.
 * Body must be a string (typically JSON.stringify'd) to ensure proper cache key serialization.
 *
 * @param url - Full API endpoint URL
 * @param method - HTTP method (default: 'GET')
 * @param body - JSON string body (use JSON.stringify for objects)
 * @param staleTime - Cache freshness in milliseconds; omit for the shared default
 * @param force - Revalidate after any request already in flight, overriding staleTime
 * @param notFoundRetries - 404 attempts allowed after the first, overriding the shared budget
 * @returns Parsed response data
 * @throws {NexusError} When response is not ok after all retries
 */
async function queryRemoteNexus<T>({
  url,
  method = HttpMethod.GET,
  body = null,
  force = false,
  staleTime,
  notFoundRetries,
}: TQueryNexusParams): Promise<T> {
  const queryKey = buildNexusQueryKey({ url, method, body, notFoundRetries });
  // A scoped 404 budget replaces the client-level retry option wholesale, so the full
  // policy is derived from the shared Nexus config and passed with the query.
  const retryPolicy = notFoundRetries === undefined ? undefined : nexusRetryPolicy(notFoundRetries);
  const retryOptions = retryPolicy ? { retry: retryPolicy.shouldRetry, retryDelay: retryPolicy.retryDelay } : {};

  const execute = async (): Promise<T> => {
    let startedAt: number | undefined;
    const data = await nexusQueryClient.fetchQuery({
      queryKey,
      ...(force ? { staleTime: 0 } : staleTime !== undefined ? { staleTime } : {}),
      ...retryOptions,
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
