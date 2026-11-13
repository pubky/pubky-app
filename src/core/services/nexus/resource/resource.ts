import { QueryObserver } from '@tanstack/react-query';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { Logger } from '@/libs/logger/logger';
import { NEXUS_RESOURCE_TAGS_OPERATION } from '@/libs/observability/sentry.constants';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { type TResourceViewerTag, withResourceViewerTag } from '@/pipes/tag/tag.resource';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusPost, NexusPostWire, NexusTag } from '@/services/nexus/nexus.types';
import { createFetchOptions, mapNexusResponse, queryNexus } from '@/services/nexus/nexus.utils';
import { resourceApi } from '@/services/nexus/resource/resource.api';
import {
  RESOURCE_BY_IDS_BATCH_MAX_MS,
  RESOURCE_BY_IDS_BATCH_MS,
  RESOURCE_BY_IDS_MAX,
  RESOURCE_BY_URI_READS_AT_ONCE,
  RESOURCE_READ_TIMEOUT_MS,
  RESOURCE_TAG_UNCONFIRMED_MS,
  RESOURCE_TAGS_LIMIT,
  RESOURCE_URI_MAX_BYTES,
} from '@/services/nexus/resource/resource.constants';
import type {
  NexusResourceTags,
  NexusResourceTagsWire,
  NexusResourceView,
  TResourceCounts,
  TResourceRepliesParams,
} from '@/services/nexus/resource/resource.types';

const OPERATION = NEXUS_RESOURCE_TAGS_OPERATION;

type TResourceTagsKey = { uri: string; viewerId?: Pubky | null };
type TResourceTagsRead = TResourceTagsKey & {
  /** Ask Nexus again even when a fresh answer is cached (after the viewer's write was indexed). */
  fresh?: boolean;
};

function queryKey({ uri, viewerId }: TResourceTagsKey) {
  return ['nexus', 'resource', 'by-uri', uri, viewerId ?? null] as const;
}

/** A write of the viewer's that Nexus' answers do not show yet: added (`isAdded`) or removed. */
type TUnconfirmedWrite = TResourceViewerTag & { isAdded: boolean; writtenAt: number };

/** The viewer's unconfirmed writes per link and viewer, by label. Module state shared by every reader. */
const unconfirmedWrites = new Map<string, Map<string, TUnconfirmedWrite>>();

function unconfirmedKey({ uri, viewerId }: TResourceTagsKey) {
  return JSON.stringify([uri, viewerId ?? null]);
}

/**
 * Nexus' answer with the viewer's writes it does not show yet, for every reader of the shared answer.
 * Forgets the writes the answer shows, and those still missing once `RESOURCE_TAG_UNCONFIRMED_MS`
 * old (Nexus did not take them), so any later read of the link ends them.
 */
function withUnconfirmedWrites(key: TResourceTagsKey, tags: NexusTag[]): NexusTag[] {
  const mapKey = unconfirmedKey(key);
  const writes = unconfirmedWrites.get(mapKey);
  if (!writes) return tags;
  const isTruncated = tags.length >= RESOURCE_TAGS_LIMIT;
  const now = Date.now();
  let result = tags;
  let unindexed = 0;
  for (const [label, write] of writes) {
    const holds = tags.some((tag) => canonicalizeTagLabel(tag.label) === label && tag.relationship);
    if (holds === write.isAdded) {
      writes.delete(label);
      continue;
    }
    if (now - write.writtenAt < RESOURCE_TAG_UNCONFIRMED_MS) {
      result = withResourceViewerTag(result, write, write.isAdded);
      continue;
    }
    writes.delete(label);
    // An add missing from a full answer may be indexed and cut off: it stays shown this time.
    if (write.isAdded && isTruncated) result = withResourceViewerTag(result, write, true);
    else unindexed++;
  }
  if (writes.size === 0) unconfirmedWrites.delete(mapKey);
  if (unindexed > 0) Logger.warn('Resource tag write not indexed by Nexus', { writes: unindexed });
  return result;
}

/** The batch-only reads under way (`fetchBatchedTags`), per link and viewer. */
const batchedReads = new Map<string, Promise<NexusTag[] | undefined>>();

/** The link's counts do not depend on the viewer: one entry per link. */
function countsKey(uri: string) {
  return ['nexus', 'resource', 'counts', uri] as const;
}

/** How fresh a link's counts stay before a reader asks again (a reply shows up within seconds). */
const COUNTS_STALE_TIME_MS = 30_000;

/**
 * Nexus reads of external resources: the tags people put on a web link (or any other URI that is
 * no Pubky object), matched by the raw URI.
 *
 * Reads go through `nexusQueryClient`, keyed by URI and viewer, so the card in a post and the
 * resource page share one request and one cached answer, and `subscribeTags` keeps every reader of
 * that answer on its latest state.
 */
export class NexusResourceService {
  private constructor() {}

  /**
   * The tags on a link: read with every other link asked at the same moment in one
   * `POST /v1/stream/resources/by_ids`, else by `GET /v1/resource/by-uri` (a Nexus without
   * `by_ids`, a failed batch, or a link the batch did not answer; see `readResourceBatched`).
   *
   * A 404 is an answer, not a failure: nobody tagged the link yet, so the read returns `[]`
   * without creating an AppError (an untagged link is the common case, and its link would
   * otherwise reach error telemetry).
   *
   * @param params.uri - The link exactly as written
   * @param params.viewerId - Marks the viewer's own tags; omit for a signed-out viewer
   * @returns The link's tags, `[]` when nobody tagged it
   * @throws AppError when Nexus fails or answers with anything else
   */
  static async fetchTagsByUri({ uri, viewerId, fresh = false }: TResourceTagsRead): Promise<NexusTag[]> {
    const url = resourceApi.byUri({ uri, viewer_id: viewerId ?? undefined, limit_tags: RESOURCE_TAGS_LIMIT });
    return nexusQueryClient.fetchQuery({
      queryKey: queryKey({ uri, viewerId }),
      ...(fresh ? { staleTime: 0 } : {}),
      queryFn: async () => {
        // A batch-only read of the link under way (`fetchBatchedTags`) answers it too, when it can.
        const sharing = batchedReads.get(unconfirmedKey({ uri, viewerId }));
        const shared = sharing && (await sharing);
        if (shared) return shared;
        // One `by_ids` request for every link read at the same moment; `by-uri` where it cannot answer.
        const batched = readResourceBatched(uri, viewerId);
        const answer = batched && (await batched);
        const body = answer !== undefined ? answer : await readByUriInTurn(() => fetchResourceOrNull(url));
        // The same answer carries the link's counts: every card reading its tags has them too.
        nexusQueryClient.setQueryData(countsKey(uri), body ? toCounts(body) : null);
        // The viewer's writes Nexus has not indexed yet stay in the shared answer.
        return withUnconfirmedWrites({ uri, viewerId }, body?.tags ?? []);
      },
    });
  }

  /**
   * The tags on a link read only in a `by_ids` batch, with the other links asked at the same moment
   * (another link of a card in a feed: no request of its own). An answer already read, or a read of the
   * link under way, is shared. `undefined` when the batch cannot answer the link (a Nexus without
   * `by_ids`, a failed batch, a link it did not match): no `by-uri` is asked and nothing is cached, so
   * a later read of the link (`fetchTagsByUri`) asks Nexus as usual.
   */
  static async fetchBatchedTags({ uri, viewerId }: TResourceTagsKey): Promise<NexusTag[] | undefined> {
    const key = queryKey({ uri, viewerId });
    const state = nexusQueryClient.getQueryState<NexusTag[]>(key);
    if (state?.fetchStatus === 'fetching') return this.fetchTagsByUri({ uri, viewerId });
    if (state?.data !== undefined) return state.data;
    const mapKey = unconfirmedKey({ uri, viewerId });
    const running = batchedReads.get(mapKey);
    if (running) return running;
    const batched = readResourceBatched(uri, viewerId);
    if (!batched) return undefined;
    const read = batched
      .then((answer) => {
        if (answer === undefined) return undefined;
        // The answer `fetchTagsByUri` would have cached: every reader of the link shares it.
        nexusQueryClient.setQueryData(countsKey(uri), answer ? toCounts(answer) : null);
        return nexusQueryClient.setQueryData<NexusTag[]>(
          key,
          withUnconfirmedWrites({ uri, viewerId }, answer?.tags ?? []),
        );
      })
      .finally(() => batchedReads.delete(mapKey));
    batchedReads.set(mapKey, read);
    return read;
  }

  /** The link's tags already read for the viewer, without asking Nexus; `undefined` when none was read. */
  static getCachedTags(key: TResourceTagsKey): NexusTag[] | undefined {
    return nexusQueryClient.getQueryData<NexusTag[]>(queryKey(key));
  }

  /** Whether the configured Nexus answered a `by_ids` request; `false` while that is not known yet. */
  static isByIdsServed(): boolean {
    return isByIdsServed;
  }

  /** Whether a write of the viewer's on the link is still missing from Nexus' answers. */
  static hasUnconfirmedTags(key: TResourceTagsKey): boolean {
    return (unconfirmedWrites.get(unconfirmedKey(key))?.size ?? 0) > 0;
  }

  /**
   * Forgets the tag reads queued for `by_ids` or waiting for a `by-uri` turn, and what is known of the
   * Nexus' `by_ids` (tests); `byIdsMissing` reads every link by `by-uri`, as on a Nexus without the route.
   */
  static clearBatch({ byIdsMissing = false }: { byIdsMissing?: boolean } = {}): void {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    pending.forEach((links) => links.forEach((waiters) => waiters.forEach((resolve) => resolve(undefined))));
    pending.clear();
    batchedReads.clear();
    isByIdsMissing = byIdsMissing;
    isByIdsServed = false;
    byIdsProbe = null;
    byUriTurns.splice(0).forEach((turn) => turn());
    byUriReads = 0;
  }

  /**
   * What Nexus counts on a link (`GET /v1/resource/by-uri`): replies, embeds and collections, with
   * the resource's id. `null` when nobody referenced or tagged the link yet (404). Shares the cache
   * entry `fetchTagsByUri` fills: a tag read of the link in flight is waited for, and a card that
   * read its tags asks nothing more.
   *
   * @throws AppError when Nexus fails or answers with anything else
   */
  static async fetchCounts({ uri }: { uri: string }): Promise<TResourceCounts | null> {
    const tagReads = nexusQueryClient
      .getQueryCache()
      .findAll({ queryKey: ['nexus', 'resource', 'by-uri', uri] })
      .filter((query) => query.state.fetchStatus === 'fetching');
    if (tagReads.length > 0) {
      await Promise.allSettled(tagReads.map((query) => query.promise));
      const counts = nexusQueryClient.getQueryData<TResourceCounts | null>(countsKey(uri));
      if (counts !== undefined) return counts;
    }
    // One tag is enough: the tags are read with the viewer's marks by `fetchTagsByUri`.
    const url = resourceApi.byUri({ uri, limit_tags: 1, limit_taggers: 1 });
    return nexusQueryClient.fetchQuery({
      queryKey: countsKey(uri),
      staleTime: COUNTS_STALE_TIME_MS,
      queryFn: async () => {
        const body = await fetchResourceOrNull(url);
        return body ? toCounts(body) : null;
      },
    });
  }

  /**
   * Calls `listener` with the link's counts each time another reader's answer changes them (a card's
   * tag read, a refetch). Never fetches. Returns the unsubscribe.
   */
  static subscribeCounts(uri: string, listener: (counts: TResourceCounts | null) => void): () => void {
    const observer = new QueryObserver<TResourceCounts | null>(nexusQueryClient, {
      queryKey: countsKey(uri),
      enabled: false,
    });
    let last = observer.getCurrentResult().data;
    return observer.subscribe(({ data }) => {
      if (data === undefined || data === last) return;
      last = data;
      listener(data);
    });
  }

  /** The counts already read for a link, without asking Nexus; `undefined` when none was read. */
  static getCachedCounts(uri: string): TResourceCounts | null | undefined {
    return nexusQueryClient.getQueryData<TResourceCounts | null>(countsKey(uri));
  }

  /**
   * The live posts replying to a resource (`GET /v1/resource/{id}/replies`), newest first, without
   * their attachments' metadata: a reply with files is read again by id.
   *
   * @throws AppError when Nexus fails or does not serve the route
   */
  static async fetchReplies({ resourceId, viewerId, skip, limit }: TResourceRepliesParams): Promise<NexusPost[]> {
    const url = resourceApi.replies(resourceId, { viewer_id: viewerId ?? undefined, skip, limit });
    // Always a fresh page: the list is read once per page view and on "show all".
    const posts = await queryNexus<NexusPostWire[]>({ url, force: true, notFoundRetries: 0 });
    return mapNexusResponse(posts, (post) => PostNormalizer.fromNexus(post));
  }

  /**
   * Calls `listener` with the link's cached tags each time they change after this call: another
   * reader's answer, a refetch, or a tag write applied by `applyViewerTag`. Never fetches; while
   * subscribed the cached answer stays in the cache. Returns the unsubscribe.
   */
  static subscribeTags(key: TResourceTagsKey, listener: (tags: NexusTag[]) => void): () => void {
    const observer = new QueryObserver<NexusTag[]>(nexusQueryClient, { queryKey: queryKey(key), enabled: false });
    let last = observer.getCurrentResult().data;
    return observer.subscribe(({ data }) => {
      if (data === undefined || data === last) return;
      last = data;
      listener(data);
    });
  }

  /**
   * Applies the viewer's tag write (accepted by the homeserver) to the cached answer for the link,
   * so every reader of the shared query sees it before Nexus indexes the write, and keeps it over
   * Nexus' later answers until one shows it or it is `RESOURCE_TAG_UNCONFIRMED_MS` old. Nothing
   * cached means nothing to patch: the next read asks Nexus and keeps the write.
   */
  static applyViewerTag({ uri, ...viewerTag }: TResourceViewerTag & { uri: string }, isAdded: boolean): void {
    const mapKey = unconfirmedKey({ uri, viewerId: viewerTag.viewerId });
    const writes = unconfirmedWrites.get(mapKey) ?? new Map<string, TUnconfirmedWrite>();
    writes.set(canonicalizeTagLabel(viewerTag.label), { ...viewerTag, isAdded, writtenAt: Date.now() });
    unconfirmedWrites.set(mapKey, writes);
    nexusQueryClient.setQueryData<NexusTag[]>(queryKey({ uri, viewerId: viewerTag.viewerId }), (cached) =>
      cached ? withResourceViewerTag(cached, viewerTag, isAdded) : cached,
    );
  }
}

/** `by-uri` tag reads under way, and the reads waiting for one of them to end. */
let byUriReads = 0;
const byUriTurns: (() => void)[] = [];

/**
 * Runs a `by-uri` tag read, at most `RESOURCE_BY_URI_READS_AT_ONCE` at a time: on a Nexus without
 * `by_ids` a resource page reads up to 40 other links, and a feed one per card. A read under the
 * limit starts in the same tick.
 */
async function readByUriInTurn<T>(read: () => Promise<T>): Promise<T> {
  if (byUriReads < RESOURCE_BY_URI_READS_AT_ONCE) byUriReads++;
  else await new Promise<void>((resolve) => byUriTurns.push(resolve));
  try {
    return await read();
  } finally {
    // The slot passes to the next waiting read, or is freed.
    const nextRead = byUriTurns.shift();
    if (nextRead) nextRead();
    else byUriReads = Math.max(0, byUriReads - 1);
  }
}

/**
 * One GET; retries come from `nexusQueryClient`. `endpoint` (error context of an HTTP error) is
 * the request without its query string, which carries a link from someone's post. A connection
 * failure or timeout is built by `safeFetch` with the full request as `context.url`; the
 * `nexus-resource-tags-transport` Sentry drop rule keeps it out of telemetry.
 */
async function fetchResourceOrNull(url: string): Promise<NexusResourceTags | null> {
  const endpoint = resourceApi.byUriEndpoint();
  // Bounded: a stalled read would hold one of the few `by-uri` turns every card waits for.
  const response = await safeFetch(
    url,
    { method: HttpMethod.GET, signal: AbortSignal.timeout(RESOURCE_READ_TIMEOUT_MS) },
    ErrorService.Nexus,
    OPERATION,
  );
  if (response.status === HttpStatusCode.NOT_FOUND) {
    response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.ok) {
    throw httpResponseToError(response, ErrorService.Nexus, OPERATION, endpoint);
  }
  const body = await parseResponseOrThrow<NexusResourceTagsWire>(response, ErrorService.Nexus, OPERATION, endpoint);
  // `/v1` marks the viewer's tags by `tag_uri` only: `relationship` is derived from it.
  return { ...body, tags: (body.tags ?? []).map((tag) => TagNormalizer.fromNexus(tag)) };
}

/** The counts of a `by-uri` answer; a count the configured Nexus does not serve stays `undefined`. */
function toCounts(body: NexusResourceTags): TResourceCounts {
  const count = (value: unknown) => (typeof value === 'number' && value >= 0 ? value : undefined);
  return {
    resourceId: body.resource.id,
    replies: count(body.replies_count),
    embeds: count(body.embeds_count),
    collections: count(body.collections_count),
  };
}

/**
 * A link's batch answer: its `by-uri` answer (`null` when Nexus knows no such resource), or
 * `undefined` when the batch cannot stand in for `by-uri` (the link was not matched, the batch
 * failed, or the configured Nexus has no `by_ids`): the caller then reads the link by itself.
 */
type TBatchedResource = NexusResourceTags | null | undefined;

type TWaiter = (answer: TBatchedResource) => void;

/** Links asked within one batch window, per viewer (`''` signed out), each with everyone waiting on it. */
const pending = new Map<string, Map<string, TWaiter[]>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** When the first link of the batch being collected was asked. */
let batchStartedAt = 0;

/** Set once the configured Nexus answered `by_ids` with 404/405, or its first `by_ids` request failed. */
let isByIdsMissing = false;
/** Set once the configured Nexus answered a `by_ids` request. */
let isByIdsServed = false;
/**
 * The `by_ids` request under way while neither is known: later batches wait for its answer, so a
 * Nexus without the route gets one request per page load, not one per batch.
 */
let byIdsProbe: Promise<void> | null = null;

/**
 * Reads a link through `POST /v0/stream/resources/by_ids`, together with the other links asked
 * around the same moment (`RESOURCE_BY_IDS_BATCH_MS` apart, `RESOURCE_BY_IDS_BATCH_MAX_MS` at most):
 * the cards of a feed and the other links of a resource page share one request (up to
 * `RESOURCE_BY_IDS_MAX` links each) instead of one `by-uri` per link.
 *
 * @returns The link's answer, resolving to `undefined` when the caller must read it by `by-uri` (see
 *   `TBatchedResource`); `undefined` itself, at once, when the link is not batched at all (no `by_ids`
 *   on this Nexus, or a link Nexus does not take as a URI), so the `by-uri` read starts in the same tick
 */
function readResourceBatched(uri: string, viewerId?: Pubky | null): Promise<TBatchedResource> | undefined {
  // Nexus refuses a whole batch for one link it does not take: such a link is read alone.
  if (isByIdsMissing || !isUri(uri) || new TextEncoder().encode(uri).length > RESOURCE_URI_MAX_BYTES) return undefined;
  return new Promise<TBatchedResource>((resolve) => {
    const viewer = viewerId ?? '';
    const links = pending.get(viewer) ?? new Map<string, TWaiter[]>();
    links.set(uri, [...(links.get(uri) ?? []), resolve]);
    pending.set(viewer, links);
    // Sent once no other link was asked for `RESOURCE_BY_IDS_BATCH_MS`, at the latest
    // `RESOURCE_BY_IDS_BATCH_MAX_MS` after the first.
    const now = Date.now();
    if (flushTimer) clearTimeout(flushTimer);
    else batchStartedAt = now;
    const wait = Math.min(RESOURCE_BY_IDS_BATCH_MS, batchStartedAt + RESOURCE_BY_IDS_BATCH_MAX_MS - now);
    flushTimer = setTimeout(flush, Math.max(0, wait));
  });
}

function flush(): void {
  flushTimer = null;
  const batches = [...pending.entries()];
  pending.clear();
  for (const [viewer, links] of batches) {
    const uris = [...links.keys()];
    for (let start = 0; start < uris.length; start += RESOURCE_BY_IDS_MAX) {
      const read = () => readChunk(uris.slice(start, start + RESOURCE_BY_IDS_MAX), viewer || undefined, links);
      if (isByIdsServed) void read();
      else if (byIdsProbe) void byIdsProbe.then(read);
      else {
        const probe: Promise<void> = read().finally(() => {
          if (byIdsProbe === probe) byIdsProbe = null;
        });
        byIdsProbe = probe;
      }
    }
  }
}

async function readChunk(uris: string[], viewerId: string | undefined, links: Map<string, TWaiter[]>) {
  const settle = (uri: string, answer: TBatchedResource) => links.get(uri)?.forEach((resolve) => resolve(answer));
  try {
    // Waited for a probe that found no `by_ids`: every link is read by `by-uri`.
    const views = isByIdsMissing ? null : await postByIds(uris, viewerId);
    const answers = matchViews(uris, views);
    uris.forEach((uri, index) => settle(uri, answers[index]));
  } catch {
    // Already reported: each link is read by `by-uri`, and a failed probe leaves `by_ids` out for
    // the page load.
    if (!isByIdsServed) isByIdsMissing = true;
    uris.forEach((uri) => settle(uri, undefined));
  }
}

/**
 * One `by_ids` request. `null` when it cannot answer this batch: the route is missing (404/405, then
 * never asked again), the body was refused (400/422) or the answer is not a list.
 *
 * @throws AppError when the request fails (connection, timeout, 5xx, malformed body)
 */
async function postByIds(uris: string[], viewerId: string | undefined): Promise<unknown[] | null> {
  // The limits a card's `by-uri` read asks for, so a view is that read's answer.
  const { url: endpoint, body } = resourceApi.byIds({ uris, viewer_id: viewerId, limit_tags: RESOURCE_TAGS_LIMIT });
  const response = await safeFetch(
    endpoint,
    // Bounded: while it probes for the route, every later batch waits for its answer.
    {
      ...createFetchOptions({ method: HttpMethod.POST, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(RESOURCE_READ_TIMEOUT_MS),
    },
    ErrorService.Nexus,
    OPERATION,
  );
  const status = response.status as HttpStatusCode;
  const isMissing = status === HttpStatusCode.NOT_FOUND || status === HttpStatusCode.METHOD_NOT_ALLOWED;
  const isRefused = status === HttpStatusCode.BAD_REQUEST || status === HttpStatusCode.UNPROCESSABLE_ENTITY;
  if (!isMissing && !isRefused && !response.ok) {
    throw httpResponseToError(response, ErrorService.Nexus, OPERATION, endpoint);
  }
  if (isMissing) isByIdsMissing = true;
  else isByIdsServed = true;
  if (isMissing || isRefused) {
    response.body?.cancel().catch(() => {});
    return null;
  }
  const views = await parseResponseOrThrow<unknown>(response, ErrorService.Nexus, OPERATION, endpoint);
  // Not a list of views: the links are read by `by-uri`.
  return Array.isArray(views) ? views : null;
}

/**
 * Each asked link's answer, in `uris` order. Nexus answers in request order and skips unknown
 * resources, and returns each URI normalized (host case, default port, fragment), so a view is
 * matched to the next asked link it names. When every view matched, an unmatched link is one Nexus
 * does not know (`null`, as `by-uri`'s 404); when a view matched none (a spelling the matching does
 * not fold) or is malformed, the unmatched links are left to `by-uri` (`undefined`).
 */
function matchViews(uris: string[], views: unknown[] | null): TBatchedResource[] {
  const answers: TBatchedResource[] = uris.map(() => undefined);
  if (!views) return answers;
  const keys = uris.map(uriKey);
  // Links a view answered: only links Nexus skipped stay unanswered.
  const isAnswered = uris.map(() => false);
  let next = 0;
  let isEveryViewMatched = true;
  for (const view of views) {
    if (!isView(view)) {
      isEveryViewMatched = false;
      continue;
    }
    const viewKey = uriKey(view.details.uri);
    let index = next;
    while (index < uris.length && uris[index] !== view.details.uri && keys[index] !== viewKey) index++;
    if (index >= uris.length) {
      isEveryViewMatched = false;
      continue;
    }
    answers[index] = toByUriAnswer(view);
    isAnswered[index] = true;
    next = index + 1;
  }
  const answeredKeys = new Set(keys.filter((_, index) => isAnswered[index]));
  // Skipped by Nexus: nobody tagged it, unless another spelling of it was answered (read it alone).
  return answers.map((answer, index) =>
    isAnswered[index] || !isEveryViewMatched || answeredKeys.has(keys[index]) ? answer : null,
  );
}

/** Whether a `by_ids` item has the fields read here (else its link is read by `by-uri`). */
function isView(view: unknown): view is NexusResourceView {
  const { details, tags } = (view ?? {}) as Partial<NexusResourceView>;
  return (
    typeof details?.uri === 'string' &&
    Array.isArray(tags) &&
    tags.every((tag) => Array.isArray(tag?.taggers) && typeof tag.taggers_count === 'number')
  );
}

/** Whether Nexus takes the link as a URI (a scheme, then anything). */
function isUri(uri: string): boolean {
  try {
    new URL(uri);
    return true;
  } catch {
    return false;
  }
}

/** The link as Nexus folds it: scheme and host lowercased, default port and fragment dropped. */
function uriKey(uri: string): string {
  try {
    const url = new URL(uri);
    url.hash = '';
    return url.href;
  } catch {
    return uri;
  }
}

/** A `by_ids` view in the shape of a `by-uri` answer. */
function toByUriAnswer({ details, tags, replies_count, embeds_count, collections_count }: NexusResourceView) {
  return { resource: details, tags, replies_count, embeds_count, collections_count } satisfies NexusResourceTags;
}
