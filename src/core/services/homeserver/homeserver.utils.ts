import { type AuthFlow } from '@synonymdev/pubky';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ServerErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError } from '@/libs/error/error.http';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { Logger } from '@/libs/logger/logger';
import { sleep } from '@/libs/utils/utils';
import { createCanceledError, extractStatusCode, handleError } from './error.utils';
import type {
  CancelableAuthApproval,
  StoragePath,
  TAssertOkParams,
  TCheckSessionExpirationParams,
  TGetOwnedResponseParams,
  TOwnedSessionPath,
  TParseResponseOrUndefinedParams,
  TResolveOwnedSessionPathParams,
} from './homeserver.types';

// URL protocol constants
const PUBKY_PROTOCOL = 'pubky://';
const PUBKYAUTH_PROTOCOL = 'pubkyauth://';
export const PUBKY_PREFIX = 'pubky';
const PUBKY_HOSTNAME_PREFIX = '_pubky.';

// Auth polling defaults
/** Default interval between auth flow polls in milliseconds */
const AUTH_POLL_INTERVAL_MS = 100;
/** Maximum auth poll attempts (3000 × 100ms = 5 minutes of polling; time parked on a hidden page does not count) */
const AUTH_POLL_MAX_ATTEMPTS = 3_000;

/**
 * Checks if a URL is an HTTP or HTTPS URL
 * @param url - The URL to check
 * @returns True if the URL is HTTP/HTTPS, false otherwise
 */
export const isHttpUrl = (url: string): boolean => {
  return url.startsWith('http://') || url.startsWith('https://');
};

/**
 * Extracts the pathname from various URL formats.
 *
 * Supported formats:
 * - `/pub/path` → `/pub/path` (relative path, returned as-is)
 * - `pubky://z32id/pub/path` → `/pub/path`
 * - `pubkyz32id/pub/path` → `/pub/path` (compact format)
 * - `https://example.com/pub/path` → `/pub/path`
 *
 * @param url - The URL to extract pathname from
 * @returns The pathname if found, null otherwise
 */
export const toPathname = (url: string): string | null => {
  if (url.startsWith('/')) return url;

  if (url.startsWith(PUBKY_PROTOCOL)) {
    const rest = url.slice(PUBKY_PROTOCOL.length);
    const idx = rest.indexOf('/');
    return idx === -1 ? null : rest.slice(idx);
  }

  if (url.startsWith(PUBKY_PREFIX) && !url.startsWith(PUBKYAUTH_PROTOCOL)) {
    const idx = url.indexOf('/', PUBKY_PREFIX.length);
    return idx === -1 ? null : url.slice(idx);
  }

  if (isHttpUrl(url)) {
    try {
      return new URL(url).pathname || null;
    } catch (error) {
      Logger.debug('Failed to parse URL pathname', { url, error });
      return null;
    }
  }

  return null;
};

/**
 * Extracts the Pubky z32 identifier from various URL formats.
 *
 * Supported formats:
 * - `pubky://z32id/path` → `z32id`
 * - `pubkyz32id/path` → `z32id` (compact format)
 * - `https://_pubky.z32id/path` → `z32id` (HTTP with pubky hostname)
 *
 * @param url - The URL to extract Pubky identifier from
 * @returns The Pubky z32 identifier if found, null otherwise
 */
export const extractPubkyZ32 = (url: string): string | null => {
  if (url.startsWith(PUBKY_PROTOCOL)) {
    const rest = url.slice(PUBKY_PROTOCOL.length);
    const idx = rest.indexOf('/');
    return (idx === -1 ? rest : rest.slice(0, idx)) || null;
  }

  if (url.startsWith(PUBKY_PREFIX) && !url.startsWith(PUBKYAUTH_PROTOCOL)) {
    const rest = url.slice(PUBKY_PREFIX.length);
    const idx = rest.indexOf('/');
    return (idx === -1 ? rest : rest.slice(0, idx)) || null;
  }

  if (isHttpUrl(url)) {
    try {
      const { hostname } = new URL(url);
      return hostname.startsWith(PUBKY_HOSTNAME_PREFIX) ? hostname.slice(PUBKY_HOSTNAME_PREFIX.length) || null : null;
    } catch (error) {
      Logger.debug('Failed to extract Pubky z32 from URL', { url, error });
      return null;
    }
  }

  return null;
};

/**
 * Parses a response as JSON, returning undefined if parsing fails with INVALID_RESPONSE error.
 * Useful when empty/invalid JSON responses are expected and should not throw.
 *
 * @param response - The response to parse
 * @param operation - The operation name for error context (used if error is re-thrown)
 * @param url - Optional endpoint URL for error context
 * @returns The parsed JSON data or undefined if parsing fails with INVALID_RESPONSE
 */
export const parseResponseOrUndefined = async <T>({
  response,
  operation = 'parseResponseOrUndefined',
  url,
}: TParseResponseOrUndefinedParams): Promise<T | undefined> => {
  try {
    return await parseResponseOrThrow<T>(response, ErrorService.Homeserver, operation, url);
  } catch (error) {
    // Empty/invalid JSON responses return undefined instead of throwing
    if (
      error instanceof AppError &&
      error.category === ErrorCategory.Server &&
      error.code === ServerErrorCode.INVALID_RESPONSE
    ) {
      return undefined;
    }
    throw error;
  }
};

/**
 * Times a flow is resumed after the relay could not be reached before the flow counts as dead. Each resume waits
 * until the page is visible (a second when it already is).
 */
const AUTH_POLL_MAX_RESUMES = 60;

/**
 * How long the relay keeps an approval (per the SDK docs). A flow older than this when the page is visible again
 * cannot find its approval, so it fails at once instead of resuming.
 */
const AUTH_RELAY_RETENTION_MS = 5 * 60 * 1000;

/**
 * A transport failure with no HTTP status: the relay never answered (aborted, refused or offline fetch).
 * The SDK reports it as a `RequestError` without `data.statusCode`; an HTTP error response carries one.
 */
const isTransientPollError = (error: unknown): boolean => {
  if (extractStatusCode(error) !== undefined) return false;
  return error instanceof Error && error.name === 'RequestError';
};

/**
 * Resolves at once when the page is visible (after a second), else on the next `visibilitychange` to visible.
 * Aborting the signal resolves it early and drops the listener.
 */
const waitUntilVisible = (signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onChange);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const onChange = () => {
      if (document.visibilityState !== 'hidden') done();
    };
    signal?.addEventListener('abort', done);
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      timer = setTimeout(done, 1000);
      return;
    }
    document.addEventListener('visibilitychange', onChange);
  });

/**
 * Creates a cancelable auth approval wrapper around an AuthFlow.
 * Pubky rc7: awaitApproval consumes the WASM handle, so we use tryPollOnce to keep flow.free() usable.
 * @param flow - The auth flow to wrap
 * @param options - Optional configuration: poll interval in milliseconds and `resume`, which reconnects to
 * the same relay channel. The SDK gives up on a flow after a few failed relay requests and never polls again,
 * so a later `tryPollOnce` cannot recover it; only a resumed flow can pick up an approval posted meanwhile.
 * @returns CancelableAuthApproval with awaitApproval promise and cancel function
 */
export const createCancelableAuthApproval = (
  initialFlow: Pick<AuthFlow, 'tryPollOnce' | 'free'>,
  options?: {
    pollIntervalMs?: number;
    maxPollAttempts?: number;
    resume?: () => Pick<AuthFlow, 'tryPollOnce' | 'free'>;
  },
): CancelableAuthApproval => {
  let flow = initialFlow;
  const pollIntervalMs = options?.pollIntervalMs ?? AUTH_POLL_INTERVAL_MS;
  const maxPollAttempts = options?.maxPollAttempts ?? AUTH_POLL_MAX_ATTEMPTS;

  let canceled = false;
  let freed = false;
  const waiting = new AbortController();

  const cancel = () => {
    canceled = true;
    waiting.abort();
    if (freed) return;
    freed = true;
    try {
      flow.free();
    } catch {
      // Ignore double-free or already-finalized WASM objects.
    }
  };

  const awaitApproval = (async () => {
    await sleep(0);

    const startedAt = Date.now();
    let attempts = 0;
    let resumes = 0;
    let resumeError: unknown;
    for (;;) {
      if (canceled) throw createCanceledError();
      if (++attempts > maxPollAttempts) {
        throw Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Auth flow timed out after maximum attempts', {
          service: ErrorService.Homeserver,
          operation: 'awaitApproval',
          context: { maxAttempts: maxPollAttempts, statusCode: HttpStatusCode.REQUEST_TIMEOUT },
        });
      }

      try {
        const maybeSession = await flow.tryPollOnce();
        if (maybeSession) return maybeSession;
      } catch (error) {
        if (canceled) throw createCanceledError();
        // A mobile browser cuts the page's network once it goes to the background (the user is approving in
        // Pubky Ring). The SDK gives up on the flow after a few failed relay requests, so wait until the
        // page is visible again and resume the flow on the same relay channel: an approval made meanwhile is
        // still there, and completes the sign-in.
        if (options?.resume && isTransientPollError(error) && ++resumes <= AUTH_POLL_MAX_RESUMES) {
          await waitUntilVisible(waiting.signal);
          if (canceled) throw createCanceledError();
          if (Date.now() - startedAt <= AUTH_RELAY_RETENTION_MS) {
            try {
              flow.free();
            } catch {
              // Ignore double-free or already-finalized WASM objects.
            }
            try {
              flow = options.resume();
              continue;
            } catch (resumeFailure) {
              // The channel cannot be resumed: fall through to the dead-flow error below.
              resumeError = resumeFailure;
            }
          }
        }
        // From the caller's view, tryPollOnce is one-shot: one call, one outcome
        // (pubky SDK 0.8 — it doesn't loop or retry on our behalf). If it throws,
        // we treat the flow as dead and fail fast — showing "session expired" now
        // is better UX than letting the user wait minutes on a flow that may already be dead.
        throw Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Auth flow polling failed', {
          service: ErrorService.Homeserver,
          operation: 'awaitApproval',
          context: {
            originalError: error instanceof Error ? error.message : String(error),
            resumeError: resumeError instanceof Error ? resumeError.message : undefined,
            statusCode: extractStatusCode(error),
          },
          cause: error,
        });
      }

      await sleep(pollIntervalMs);
    }
  })();

  return {
    awaitApproval: awaitApproval.finally(() => cancel()),
    cancel,
  };
};

/**
 * Resolves an owned session path from a URL: the URL must belong to the current session's pubky and
 * sit under one of the writable storage roots.
 *
 * @param url - The URL to resolve
 * @param session - The current session (or null if not authenticated)
 * @param allowedPrefixes - Writable storage roots (`/pub/`, `/priv/`)
 * @returns Object with session and path if owned, null otherwise
 */
export const resolveOwnedSessionPath = ({
  url,
  session,
  allowedPrefixes,
}: TResolveOwnedSessionPathParams): TOwnedSessionPath | null => {
  if (!session) return null;

  const pathname = toPathname(url);
  if (!pathname || !allowedPrefixes.some((prefix) => pathname.startsWith(prefix))) return null;
  const path = pathname as StoragePath<string>;

  if (url.startsWith('/')) return { session, path };

  const sessionPubky = session.info?.publicKey?.z32?.();
  if (!sessionPubky) return null;

  const urlPubky = extractPubkyZ32(url);
  if (!urlPubky || urlPubky !== sessionPubky) return null;

  return { session, path };
};

/**
 * Checks if the response indicates a session expiration (401 Unauthorized).
 * If so, throws a SESSION_EXPIRED error with the response message.
 *
 * @param response - The response to check
 * @param url - The URL that was requested
 * @throws {AppError} When response status is 401
 */
export const checkSessionExpiration = async ({ response, url }: TCheckSessionExpirationParams): Promise<void> => {
  if (response.status === HttpStatusCode.UNAUTHORIZED) {
    let errorMessage = 'Session expired';
    try {
      const text = await response.text();
      if (text) {
        errorMessage = text;
      }
    } catch {
      // Ignore error reading response body
    }
    throw Err.auth(AuthErrorCode.SESSION_EXPIRED, errorMessage, {
      service: ErrorService.Homeserver,
      operation: 'checkSessionExpiration',
      context: { endpoint: url, statusCode: HttpStatusCode.UNAUTHORIZED },
    });
  }
};

/**
 * Asserts that a response is OK, throwing an error if not.
 * Checks for session expiration and throws appropriate errors.
 *
 * @param response - The response to check
 * @param url - The URL that was requested
 * @param operation - The operation name for error context
 * @throws {AppError} When response is not OK
 */
export const assertOk = async ({ response, url, operation }: TAssertOkParams): Promise<void> => {
  if (response.ok) return;
  await checkSessionExpiration({ response, url });
  throw httpResponseToError(response, ErrorService.Homeserver, operation, url);
};

/**
 * Gets a response from session storage with error handling and validation.
 * Attempts to get the response, handles errors, and asserts the response is OK.
 *
 * @param session - The session to get the response from
 * @param path - The path to get
 * @param url - The URL for error context
 * @returns The response from storage
 * @throws {HomeserverError} When response is not OK or storage.get fails
 */
export const getOwnedResponse = async ({ session, path, url }: TGetOwnedResponseParams): Promise<Response> => {
  const response = await session.storage.get(path).catch((error) =>
    // Transforms the error into an AppError and re-throws to caller
    handleError({ error, additionalContext: { url, method: HttpMethod.GET } }),
  );

  await assertOk({ response, url, operation: 'getOwnedResponse' });
  return response;
};
