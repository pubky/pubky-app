import { z } from 'zod';
import type { TPaykitCreatorProbeParams } from '@/application/paykit-creator/paykit-creator.types';
import { getPaykitServerUrl } from '@/config/network';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { parseRetryAfterHeader } from '@/libs/http/response.utils';
import { sleep } from '@/libs/utils/utils';

const PROBE_TIMEOUT_MS = 6000;
const OPERATION = 'NextJsPaykitCreatorService.isCreatorHeld';

/**
 * A 503 from `/setup/creator-held` is passing storage trouble (Paykit sends `Retry-After: 1`), so it is
 * asked once more after that wait when the wait is this short and fits the timeout. A 429 is not
 * retried here: Paykit sends `Retry-After: 60`, so the dialog's Try again is the retry.
 */
const MAX_UNAVAILABLE_WAIT_MS = 2000;

/**
 * How long an answer is reused. A creator Paykit holds stays held until someone removes it, so that answer
 * covers a retry, a reopened dialog and the diagnosis after a failed setup. "Not held" is kept shorter
 * because a creator can finish a setup in between.
 */
const HELD_TTL_MS = 120_000;
const NOT_HELD_TTL_MS = 15_000;
/** Bounds memory when many creators ask; the oldest answers go first. */
const MAX_CACHED_ANSWERS = 500;

const creatorHeldResponseSchema = z.object({ held: z.boolean() });

const answers = new Map<string, { held: boolean; expiresAt: number }>();
const inFlight = new Map<string, Promise<boolean>>();

/**
 * Server-only read of whether the Paykit Server holds a creator.
 *
 * Paykit's `GET /setup/creator-held?creator=…` answers `{ "held": true | false }` and does nothing
 * else: no setup flow, no pending-flow capacity and no setup-start budget. It has its own per-client-IP
 * read limit (600 a minute by default) and refuses with 429 when that is spent and 503 when its storage
 * cannot answer, so neither is ever read as "not held". A 400 means Paykit rejected the query. The
 * Paykit Server sends no `Access-Control-Allow-Origin`, so the app asks it from here, the way
 * `/api/btc-rate` reaches an API a browser cannot.
 *
 * Every caller of this route shares the app server's address, and so that read limit. An answer is
 * therefore reused for the same creator (`HELD_TTL_MS`, `NOT_HELD_TTL_MS`), and concurrent callers share
 * one request. Failures are not kept, so the next caller asks again. The cache is per server instance.
 */
export class NextJsPaykitCreatorService {
  private constructor() {}

  static async isCreatorHeld({ creator }: TPaykitCreatorProbeParams): Promise<boolean> {
    const paykitServerUrl = getPaykitServerUrl();
    if (!paykitServerUrl) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'No Paykit Server configured', {
        service: ErrorService.Locks,
        operation: OPERATION,
      });
    }
    const paykitOrigin = new URL(paykitServerUrl).origin;
    const key = `${paykitOrigin}|${creator}`;
    const now = Date.now();
    const cached = answers.get(key);
    if (cached && cached.expiresAt > now) return cached.held;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const probe = this.probe(paykitOrigin, creator).then((held) => {
      this.remember(key, held);
      return held;
    });
    inFlight.set(key, probe);
    try {
      return await probe;
    } finally {
      inFlight.delete(key);
    }
  }

  private static remember(key: string, held: boolean): void {
    const now = Date.now();
    for (const [stored, answer] of answers) if (answer.expiresAt <= now) answers.delete(stored);
    while (answers.size >= MAX_CACHED_ANSWERS) {
      const oldest = answers.keys().next().value;
      if (oldest === undefined) break;
      answers.delete(oldest);
    }
    answers.set(key, { held, expiresAt: now + (held ? HELD_TTL_MS : NOT_HELD_TTL_MS) });
  }

  private static async probe(paykitOrigin: string, creator: string): Promise<boolean> {
    const url = new URL('/setup/creator-held', paykitOrigin);
    url.searchParams.set('creator', creator);
    const endpoint = url.origin + url.pathname;
    const deadline = Date.now() + PROBE_TIMEOUT_MS;
    const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);

    let response = await this.ask(url.href, signal);
    if (response.status === HttpStatusCode.SERVICE_UNAVAILABLE) {
      const waitMs = (parseRetryAfterHeader(response.headers.get('retry-after')) ?? 1) * 1000;
      if (waitMs <= MAX_UNAVAILABLE_WAIT_MS && Date.now() + waitMs < deadline) {
        discardBody(response);
        await sleep(waitMs);
        response = await this.ask(url.href, signal);
      }
    }

    if (response.status !== HttpStatusCode.OK) {
      discardBody(response);
      throw httpResponseToError(response, ErrorService.Locks, OPERATION, endpoint);
    }
    const body = creatorHeldResponseSchema.safeParse(await response.json().catch(() => undefined));
    if (!body.success) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Paykit creator-held response is invalid', {
        service: ErrorService.Locks,
        operation: OPERATION,
        context: { endpoint },
      });
    }
    return body.data.held;
  }

  private static ask(href: string, signal: AbortSignal): Promise<Response> {
    return safeFetch(
      href,
      { method: HttpMethod.GET, credentials: 'omit', redirect: 'manual', cache: 'no-store', signal },
      ErrorService.Locks,
      OPERATION,
    );
  }
}

/** Releases the connection behind an answer that is not read. */
function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => {});
}
