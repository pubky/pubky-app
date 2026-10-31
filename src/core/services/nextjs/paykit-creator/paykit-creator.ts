import type { TPaykitCreatorProbeParams } from '@/application/paykit-creator/paykit-creator.types';
import { getPaykitServerUrl } from '@/config/network';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';

const PROBE_TIMEOUT_MS = 6000;
const OPERATION = 'NextJsPaykitCreatorService.isCreatorHeld';

/**
 * How long an answer is reused. A creator Paykit holds stays held until someone removes it, so that answer
 * covers a retry, a reopened dialog and the diagnosis after a failed setup. "Not held" is kept shorter
 * because a creator can finish a setup in between.
 */
const HELD_TTL_MS = 120_000;
const NOT_HELD_TTL_MS = 15_000;
/** Bounds memory when many creators ask; the oldest answers go first. */
const MAX_CACHED_ANSWERS = 500;

const answers = new Map<string, { held: boolean; expiresAt: number }>();
const inFlight = new Map<string, Promise<boolean>>();

/**
 * Server-only read of whether the Paykit Server holds a creator.
 *
 * The Paykit Server has no status read a browser can use: it sends no `Access-Control-Allow-Origin`,
 * and its `/setup/status` needs the Lock Server's authenticated request. `GET /setup/reconnect` is
 * public and answers before it serves any page: 200 when it holds the creator, 400 `invalid_request`
 * when it does not. So the app asks it from here, the way `/api/btc-rate` reaches an API a browser
 * cannot.
 *
 * Each probe opens a throwaway flow on the Paykit Server (in memory, five minutes, no approval) and
 * costs one request against its per-IP rate limit, which every caller of this route shares, because
 * Paykit has no read that skips that limit. So an answer is reused for the same creator and origin
 * (`HELD_TTL_MS`, `NOT_HELD_TTL_MS`), and concurrent callers share one request: a retry, a reopened dialog
 * or a diagnosis right after the check never spends more of the budget. Failures are not kept, so the next
 * caller asks again. The cache is per server instance.
 * `return_to` is checked by Paykit too, so a 400 for a rejected origin looks the same as "not held";
 * the setup iframe would be refused for that origin as well.
 */
export class NextJsPaykitCreatorService {
  private constructor() {}

  static async isCreatorHeld({ creator, returnTo }: TPaykitCreatorProbeParams): Promise<boolean> {
    const paykitServerUrl = getPaykitServerUrl();
    if (!paykitServerUrl) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'No Paykit Server configured', {
        service: ErrorService.Locks,
        operation: OPERATION,
      });
    }
    const paykitOrigin = new URL(paykitServerUrl).origin;
    const key = `${paykitOrigin}|${returnTo}|${creator}`;
    const now = Date.now();
    const cached = answers.get(key);
    if (cached && cached.expiresAt > now) return cached.held;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const probe = this.probe(paykitOrigin, creator, returnTo).then((held) => {
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

  private static async probe(paykitOrigin: string, creator: string, returnTo: string): Promise<boolean> {
    const url = new URL('/setup/reconnect', paykitOrigin);
    url.searchParams.set('creator', creator);
    url.searchParams.set('return_to', returnTo);
    url.searchParams.set('state', crypto.randomUUID());

    const response = await safeFetch(
      url.href,
      {
        method: HttpMethod.GET,
        credentials: 'omit',
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      },
      ErrorService.Locks,
      OPERATION,
    );
    // The held answer is a full HTML page; only its status matters.
    void response.body?.cancel().catch(() => {});

    if (response.status === HttpStatusCode.OK) return true;
    if (response.status === HttpStatusCode.BAD_REQUEST) return false;
    throw httpResponseToError(response, ErrorService.Locks, OPERATION, url.origin + url.pathname);
  }
}
