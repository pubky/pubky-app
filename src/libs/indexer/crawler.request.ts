import { mapLimit, type RequestGate, type Schedule, throwIfAborted, withDeadline } from './concurrency';
import { type Counter, type OperationContext } from './crawler.context';
import type { CrawlerOptions } from './crawler.types';
import type { Domain } from './domain.types';
import {
  HomeserverUnreachableError,
  IndexerAbortedError,
  InvalidIndexInputError,
  RateLimitedError,
  RequestTimeoutError,
} from './indexer.errors';
import type { RecordEntry, Run } from './indexer.types';
import type { ReadPage } from './paging';
import type { IndexStore } from './store.types';
import type { TimeSample } from './timeTable';
import type { AuthoredStreamEvent, IndexerTransport } from './transport.types';

const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;
/** Waits before retrying a request that failed: doubling per retry of it, up to the max. */
const RETRY_FIRST_WAIT_MS = 1000;
const RETRY_MAX_WAIT_MS = 8 * 1000;
const RETRIES = 3;
const MICROS_PER_MS = BigInt(1000);

/** The homeserver routes the crawler calls: the event stream, public files and the user's own index files. */
export type Route = 'stream' | 'file' | 'index';

export interface RequestDeps<D> {
  transport: IndexerTransport;
  store: IndexStore<D>;
  domain: Domain<D>;
  now: () => number;
  wait: (ms: number, signal?: AbortSignal) => Promise<void>;
  schedule: Schedule;
  options: CrawlerOptions;
  gate: RequestGate;
  count: (counter: Counter, by?: number) => void;
  markFailed: (ctx: OperationContext, homeserver: string) => void;
}

/** How the crawler asks homeservers: each request retried, each failure kept to its homeserver. */
export interface Requests<D> {
  reader(ctx: OperationContext, homeserver: string, paths: string[], limit: number): ReadPage;
  guard(ctx: OperationContext, homeserver: string, work: () => Promise<void>): Promise<boolean>;
  bodyOf(ctx: OperationContext, homeserver: string, author: string, record: RecordEntry<D>): Promise<D | null>;
  attachBodies(ctx: OperationContext, runs: readonly Run<D>[]): Promise<void>;
  /** One request to the homeserver on the route, retried, under `timeoutMs`. */
  send<T>(
    ctx: OperationContext,
    homeserver: string,
    route: Route,
    timeoutMs: number,
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T>;
}

export function createRequests<D>(deps: RequestDeps<D>): Requests<D> {
  const { transport, store, domain, now, wait, schedule, options, gate, count, markFailed } = deps;

  /**
   * Runs a request to the homeserver, retrying a 429 or a failure up to `RETRIES` times: a 429 once the gate opens
   * its route again, a failure after a wait that doubles per retry of this request. So one slow or failed request
   * costs a retry, and only a request that keeps failing fails its homeserver.
   */
  async function attempt<T>(ctx: OperationContext, homeserver: string, request: () => Promise<T>): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      throwIfAborted(ctx.signal);
      try {
        return await request();
      } catch (error) {
        throwIfAborted(ctx.signal);
        if (!(error instanceof RateLimitedError || error instanceof HomeserverUnreachableError)) throw error;
        if (retry >= RETRIES) throw error;
        // The gate holds a rate-limited route closed for every request; a failure waits on its own.
        if (error instanceof HomeserverUnreachableError) {
          await wait(Math.min(RETRY_FIRST_WAIT_MS * 2 ** retry, RETRY_MAX_WAIT_MS), ctx.signal);
        }
        // Another request of this operation gave up on the homeserver meanwhile: ask it nothing more.
        if (ctx.failed.has(homeserver)) throw error;
      }
    }
  }

  /**
   * One call to the homeserver once the gate lets it go, under the request deadline from then on; past it the
   * request fails as unreachable. A homeserver limits each route on its own, so the gate paces each.
   */
  async function call<T>(
    ctx: OperationContext,
    homeserver: string,
    route: Route,
    request: (signal: AbortSignal) => Promise<T>,
    timeoutMs = options.requestTimeoutMs,
  ) {
    try {
      return await gate.run(
        homeserver,
        ctx.priority,
        () => withDeadline(request, timeoutMs, schedule, ctx.signal),
        ctx.signal,
        route,
      );
    } catch (error) {
      if (error instanceof RequestTimeoutError) throw new HomeserverUnreachableError(homeserver, { cause: error });
      throw error;
    }
  }

  function reader(ctx: OperationContext, homeserver: string, paths: string[], limit: number): ReadPage {
    return async (users, reverse) => {
      const events = await attempt(ctx, homeserver, () => {
        count('streamRequests');
        return call(ctx, homeserver, 'stream', (signal) =>
          transport.readEvents({ homeserver, users, paths, limit, reverse, signal }),
        );
      });
      count('events', events.length);
      const newest = events.reduce<AuthoredStreamEvent | null>(
        (high, event) => (high === null || event.cursor > high.cursor ? event : high),
        null,
      );
      const known = ctx.highWater.get(homeserver);
      if (newest !== null && (known === undefined || newest.cursor > known.cursor)) {
        ctx.highWater.set(homeserver, { cursor: newest.cursor, author: newest.author });
      }
      // Only a write dates its cursor: a delete of an old path can happen any time later.
      const dated = events.flatMap(({ type, path, cursor, author }): TimeSample[] => {
        const time = type === 'PUT' ? domain.timeOfPath(path) : null;
        return time === null ? [] : [{ cursor, ms: Number(time / MICROS_PER_MS), writer: author }];
      });
      for (const into of [ctx.clocks, ctx.unsaved]) {
        const known = into.get(homeserver);
        if (known === undefined) into.set(homeserver, [...dated]);
        else known.push(...dated);
      }
      return events;
    };
  }

  /** Runs `work` for one homeserver. A failure marks it failed for this operation instead of throwing. */
  async function guard(ctx: OperationContext, homeserver: string, work: () => Promise<void>): Promise<boolean> {
    try {
      await work();
      return true;
    } catch (error) {
      throwIfAborted(ctx.signal);
      if (error instanceof IndexerAbortedError) throw error;
      const unreachable = error instanceof HomeserverUnreachableError || error instanceof InvalidIndexInputError;
      if (!unreachable && !(error instanceof RateLimitedError)) throw error;
      // Reads of one operation that run together fail a homeserver once: one failure, one step of backoff.
      if (ctx.failed.has(homeserver)) return false;
      markFailed(ctx, homeserver);
      if (unreachable) {
        const { failure } = await store.readHomeserverState(homeserver);
        const failures = (failure?.failures ?? 0) + 1;
        const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
        await store.patchHomeserverState(homeserver, { failure: { failures, retryAt: now() + delay } });
      }
      return false;
    }
  }

  async function bodyOf(
    ctx: OperationContext,
    homeserver: string,
    author: string,
    record: RecordEntry<D>,
  ): Promise<D | null> {
    const bytes = await attempt(ctx, homeserver, () => {
      count('bodyRequests');
      return call(ctx, homeserver, 'file', (signal) => transport.getPublic({ author, path: record.path, signal }));
    });
    // A 404 or other bytes mean a later event replaced this one, and that event brings the data.
    if (bytes === null) return null;
    if (record.hash !== undefined && domain.matchesHash !== undefined && !domain.matchesHash(bytes, record.hash)) {
      return null;
    }
    return domain.reduce(author, record.path, bytes);
  }

  /** Sets `data` on the records of fresh runs that need their file to render. */
  async function attachBodies(ctx: OperationContext, runs: readonly Run<D>[]): Promise<void> {
    const records = runs.flatMap((run) =>
      run.entries.flatMap((entry) =>
        entry.kind === 'record' && domain.needsBody(entry.path) === 'render'
          ? [{ homeserver: run.homeserver, author: run.author, record: entry }]
          : [],
      ),
    );
    await mapLimit(records, options.homeserverConcurrency, async ({ homeserver, author, record }) => {
      const data = await bodyOf(ctx, homeserver, author, record);
      if (data !== null) record.data = data;
    });
  }

  const send = <T>(
    ctx: OperationContext,
    homeserver: string,
    route: Route,
    timeoutMs: number,
    request: (signal: AbortSignal) => Promise<T>,
  ) => attempt(ctx, homeserver, () => call(ctx, homeserver, route, request, timeoutMs));

  return { reader, guard, bodyOf, attachBodies, send };
}
