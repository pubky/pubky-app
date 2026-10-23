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
 * Server-only read of whether the Paykit Server holds a creator.
 *
 * The Paykit Server has no status read a browser can use: it sends no `Access-Control-Allow-Origin`,
 * and its `/setup/status` needs the Lock Server's authenticated request. `GET /setup/reconnect` is
 * public and answers before it serves any page: 200 when it holds the creator, 400 `invalid_request`
 * when it does not. So the app asks it from here, the way `/api/btc-rate` reaches an API a browser
 * cannot.
 *
 * Each call opens a throwaway flow on the Paykit Server (in memory, five minutes, no approval) and
 * costs one request against its per-IP rate limit, which every caller of this route shares.
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
    const url = new URL('/setup/reconnect', new URL(paykitServerUrl).origin);
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
