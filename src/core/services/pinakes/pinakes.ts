import { getPinakesUrl, PINAKES_REQUEST_TIMEOUT_MS, PINAKES_URI_MAX_BYTES } from '@/config/pinakes';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { pinakesCardStaleTime, pinakesQueryClient } from './pinakes.query-client';
import type {
  TPinakesCard,
  TPinakesGroupDetail,
  TPinakesResourceDetail,
  TPinakesSearchResponse,
} from './pinakes.types';

const BY_URI_PATH = '/v1/resources/by-uri';
const SEARCH_PATH = '/v1/search';
const GROUPS_PATH = '/v1/groups';
const RESOLVE_PATH = '/v1/resolve';
const RESOURCES_PATH = '/v1/resources';
/** `POST /v1/resolve` answers 202 with a `pending` card while the link is still read. */
const ACCEPTED = 202;
/**
 * What `POST /v1/resolve` answers when it will not read a link now: 400 (a link it does not read),
 * 404 or 405 (a Pinakes without the route), 429 (its own per-minute budget), 503 (the hourly
 * new-link budget).
 */
const QUIET_RESOLVE_STATUSES: ReadonlySet<number> = new Set([400, 404, 405, 429, 503]);

/**
 * Pinakes service: read-only reads of the public Pinakes API (`PUBKY_RUNTIME_PINAKES_URL`),
 * which reads the external links people reference on Pubky into typed cards.
 *
 * Every read goes through `pinakesQueryClient` (cache, in-flight dedupe, retry). With no Pinakes
 * origin configured every read answers "nothing" without a request, so the feature is off.
 * Nothing is persisted to IndexedDB: a card is enrichment of a link, like its Open Graph preview.
 */
export class PinakesService {
  private constructor() {}

  /**
   * One link's card by its URI (`GET /v1/resources/by-uri`).
   *
   * @param uri - The link as referenced; Pinakes normalises it and answers an alias with its root
   * @returns The card, or `null` when Pinakes does not know the link (404, nothing is fetched there),
   * the link is too long to be known, or Pinakes is not configured
   * @throws AppError when Pinakes fails or answers with anything else
   */
  static async fetchCardByUri(
    uri: string,
    { fresh = false }: { fresh?: boolean } = {},
  ): Promise<TPinakesResourceDetail | null> {
    const base = getPinakesBaseUrl();
    if (!base || new TextEncoder().encode(uri).length > PINAKES_URI_MAX_BYTES) return null;

    return pinakesQueryClient.fetchQuery({
      queryKey: byUriKey(uri),
      // `fresh`: a re-read of a link Pinakes did not know yet asks again, whatever the cache holds.
      staleTime: fresh ? 0 : pinakesCardStaleTime,
      queryFn: () =>
        fetchPinakesOrNull<TPinakesResourceDetail>({
          url: `${base}${BY_URI_PATH}?${new URLSearchParams({ uri })}`,
          endpoint: `${base}${BY_URI_PATH}`,
          operation: 'fetchCardByUri',
        }),
    });
  }

  /**
   * One card by its Pinakes ID (`GET /v1/resources/{id}`), never from the cache: what a link that
   * was read on demand (`resolveCard`, answered `pending`) is read again by.
   *
   * @returns The card, or `null` when the ID is unknown or Pinakes is not configured
   * @throws AppError when Pinakes fails
   */
  static async fetchCardById(id: string): Promise<TPinakesResourceDetail | null> {
    const base = getPinakesBaseUrl();
    if (!base) return null;
    return fetchPinakesOrNull<TPinakesResourceDetail>({
      url: `${base}${RESOURCES_PATH}/${encodeURIComponent(id)}`,
      endpoint: `${base}${RESOURCES_PATH}/{id}`,
      operation: 'fetchCardById',
    });
  }

  /**
   * Asks Pinakes to read a link now (`POST /v1/resolve`): the card within about 3 s (200), else a
   * `pending` card with its ID to read again (202). Pinakes keeps such a card for a few days unless
   * someone references the link; it is no reference and is not listed by search. Its own budget
   * (`previews_per_minute`, `previews_per_uri_per_minute`) is small, so no retry here.
   *
   * A card is optional: every refusal answers `null` quietly (see `QUIET_RESOLVE_STATUSES`; any
   * other failure is reported), and the caller keeps the link's own preview. A link that carries
   * credentials (`user:password@`) or does not parse is never sent.
   *
   * @returns The card (`pending` while still read), or `null`
   */
  static async resolveCard(uri: string): Promise<TPinakesResourceDetail | null> {
    const base = getPinakesBaseUrl();
    if (!base || new TextEncoder().encode(uri).length > PINAKES_URI_MAX_BYTES || !isResolvableLink(uri)) {
      return null;
    }
    const endpoint = `${base}${RESOLVE_PATH}`;
    try {
      const response = await safeFetch(
        endpoint,
        {
          method: HttpMethod.POST,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uri }),
          signal: AbortSignal.timeout(PINAKES_REQUEST_TIMEOUT_MS),
        },
        ErrorService.Pinakes,
        'resolveCard',
      );
      if (response.status !== HttpStatusCode.OK && response.status !== ACCEPTED) {
        // Refusals Pinakes documents for this route stay quiet; anything else is reported.
        if (!QUIET_RESOLVE_STATUSES.has(response.status)) {
          httpResponseToError(response, ErrorService.Pinakes, 'resolveCard', endpoint);
        }
        response.body?.cancel().catch(() => {});
        return null;
      }
      return await parseResponseOrThrow<TPinakesResourceDetail>(
        response,
        ErrorService.Pinakes,
        'resolveCard',
        endpoint,
      );
    } catch {
      // A transport failure or a malformed body was already reported as an AppError (the
      // `pinakes-transport` Sentry rule drops the transport ones); the link keeps its own preview.
      return null;
    }
  }

  /**
   * Puts a card read on demand into the cache of `fetchCardByUri`, so the link's next card read
   * (the post that was being written, once published) shows it at once.
   */
  static seedCardByUri(uri: string, card: TPinakesResourceDetail): void {
    pinakesQueryClient.setQueryData(byUriKey(uri), card);
  }

  /**
   * What the people who tagged a resource also referenced (`GET /v1/search?related=<id>`), ranked
   * by how many of them did. A resource in a group stands for the group, whose members are never
   * listed.
   *
   * @param id - Pinakes resource ID
   * @param limit - Results to ask for (1-500)
   * @returns The related cards, `[]` when there are none or Pinakes is not configured
   * @throws AppError when Pinakes fails
   */
  static async fetchRelated(id: string, limit: number): Promise<TPinakesCard[]> {
    const base = getPinakesBaseUrl();
    if (!base) return [];

    const response = await pinakesQueryClient.fetchQuery({
      queryKey: ['pinakes', 'related', id, limit],
      queryFn: () =>
        fetchPinakesOrNull<TPinakesSearchResponse>({
          url: `${base}${SEARCH_PATH}?${new URLSearchParams({ related: id, limit: String(limit) })}`,
          endpoint: `${base}${SEARCH_PATH}`,
          operation: 'fetchRelated',
        }),
    });
    return response?.items ?? [];
  }

  /**
   * A group's members, every member's own card (`GET /v1/groups/{id}`).
   *
   * @param id - Group ID, from a card's `group.id`
   * @returns The group, or `null` when it no longer exists (404) or Pinakes is not configured
   * @throws AppError when Pinakes fails
   */
  static async fetchGroup(id: string): Promise<TPinakesGroupDetail | null> {
    const base = getPinakesBaseUrl();
    if (!base) return null;

    const endpoint = `${base}${GROUPS_PATH}/${encodeURIComponent(id)}`;
    return pinakesQueryClient.fetchQuery({
      queryKey: ['pinakes', 'group', id],
      queryFn: () => fetchPinakesOrNull<TPinakesGroupDetail>({ url: endpoint, endpoint, operation: 'fetchGroup' }),
    });
  }
}

/** The configured origin without trailing slashes, so a base with a path prefix keeps it. */
function getPinakesBaseUrl(): string | null {
  const base = getPinakesUrl();
  return base ? base.replace(/\/+$/, '') : null;
}

/** Whether a link may be sent to be read: it parses and carries no username or password. */
function isResolvableLink(uri: string): boolean {
  try {
    const url = new URL(uri);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}

/** The cache key of a link's card read. */
function byUriKey(uri: string): readonly unknown[] {
  return ['pinakes', 'by-uri', uri];
}

/**
 * One GET with no retry of its own, ended after `PINAKES_REQUEST_TIMEOUT_MS`. A 404 is an answer
 * ("Pinakes does not know it"), not a failure, so it returns `null` without creating an AppError.
 * A timeout or connection failure is a Network AppError the `pinakes-transport` Sentry drop rule
 * keeps out of telemetry.
 *
 * `endpoint` is the request without its query string: it goes into error context, and a
 * `by-uri` query carries a link from someone's post.
 */
async function fetchPinakesOrNull<T>({
  url,
  endpoint,
  operation,
}: {
  url: string;
  endpoint: string;
  operation: string;
}): Promise<T | null> {
  const response = await safeFetch(
    url,
    { method: HttpMethod.GET, signal: AbortSignal.timeout(PINAKES_REQUEST_TIMEOUT_MS) },
    ErrorService.Pinakes,
    operation,
  );
  if (response.status === HttpStatusCode.NOT_FOUND) {
    response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.ok) {
    throw httpResponseToError(response, ErrorService.Pinakes, operation, endpoint);
  }
  return parseResponseOrThrow<T>(response, ErrorService.Pinakes, operation, endpoint);
}
