import type { XCallbackParams } from '@synonymdev/pubky';
import {
  PASSPORT_ACK_MESSAGE_TYPE,
  PASSPORT_AUTHORIZE_PATH,
  PASSPORT_MESSAGE_VERSION,
  PASSPORT_OUTCOME_MESSAGE_TYPE,
  PASSPORT_RETURN_MESSAGE_TYPE,
  PASSPORT_RETURN_PATH,
  PASSPORT_RETURN_QUERY,
  PASSPORT_X_SOURCE,
} from '@/config/passport';
import type {
  PassportMessageEventLike,
  PassportOutcome,
  PassportOutcomeAck,
  PassportOutcomeMessage,
  PassportReturnMessage,
  PassportReturnPostMessage,
} from './passport.types';

/**
 * Pure helpers for the Pubky Passport hand-off. No IO, no DOM access beyond the values passed in.
 * The hook (`usePassportAuth`) owns the popup, listeners and timers; the callback page owns the
 * `window.opener` post. Everything here is deterministic and unit-tested in isolation.
 */

const PASSPORT_OUTCOMES: ReadonlySet<string> = new Set<PassportOutcome>(['success', 'error', 'cancel']);

/** Narrow an unknown value to a {@link PassportOutcome}. */
export function isPassportOutcome(value: unknown): value is PassportOutcome {
  return typeof value === 'string' && PASSPORT_OUTCOMES.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Origin (`scheme://host[:port]`) of a Passport base URL. Throws on a malformed URL. */
export function getPassportOrigin(passportUrl: string): string {
  return new URL(passportUrl).origin;
}

/**
 * Build the popup destination: `<passport origin>/authorize#d=<encoded pubkyauth URL>`.
 * The authorization URL is encoded exactly once and carried in the fragment so it never reaches
 * Passport's server logs. It contains the relay secret, so callers must not log the result.
 */
export function buildPassportAuthorizeUrl(passportUrl: string, authorizationUrl: string): string {
  const url = new URL(PASSPORT_AUTHORIZE_PATH, getPassportOrigin(passportUrl));
  url.hash = `d=${encodeURIComponent(authorizationUrl)}`;
  return url.href;
}

/** Build the same-origin callback URL Passport navigates to for one outcome of one attempt. */
export function buildPassportReturnUrl(appOrigin: string, attemptId: string, outcome: PassportOutcome): string {
  const url = new URL(PASSPORT_RETURN_PATH, appOrigin);
  url.searchParams.set(PASSPORT_RETURN_QUERY.attempt, attemptId);
  url.searchParams.set(PASSPORT_RETURN_QUERY.outcome, outcome);
  return url.href;
}

/**
 * x-callback-url metadata for the cookie auth flow. All three destinations share the app origin,
 * as Passport requires, and carry the unpredictable per-attempt id so the callback page's message
 * can be correlated with the attempt that opened the popup.
 */
export function buildPassportCallbacks(appOrigin: string, attemptId: string): XCallbackParams {
  return {
    xSource: PASSPORT_X_SOURCE,
    xSuccess: buildPassportReturnUrl(appOrigin, attemptId, 'success'),
    xError: buildPassportReturnUrl(appOrigin, attemptId, 'error'),
    xCancel: buildPassportReturnUrl(appOrigin, attemptId, 'cancel'),
  };
}

/**
 * Validate a `message` event as a Passport outcome for the given popup.
 * Requires the exact Passport origin, the popup as source, the contract type and version, a known
 * outcome and a string message id. Returns `null` for anything else; callers must not log the payload.
 */
export function parsePassportOutcomeMessage(
  event: PassportMessageEventLike,
  popup: unknown,
  passportOrigin: string,
): PassportOutcomeMessage | null {
  if (popup === null || popup === undefined) return null;
  if (event.origin !== passportOrigin || event.source !== popup) return null;
  if (!isRecord(event.data)) return null;

  const { type, version, outcome, messageId } = event.data;
  if (type !== PASSPORT_OUTCOME_MESSAGE_TYPE || version !== PASSPORT_MESSAGE_VERSION) return null;
  if (!isPassportOutcome(outcome) || typeof messageId !== 'string' || messageId.length === 0) return null;

  return { outcome, messageId };
}

/**
 * Validate a `message` event as the same-origin callback page reporting for the given attempt.
 * Requires the app origin, the popup as source, the contract type, the exact attempt id and a known outcome.
 */
export function parsePassportReturnMessage(
  event: PassportMessageEventLike,
  popup: unknown,
  appOrigin: string,
  attemptId: string,
): PassportReturnMessage | null {
  if (popup === null || popup === undefined) return null;
  if (event.origin !== appOrigin || event.source !== popup) return null;
  if (!isRecord(event.data)) return null;

  const { type, outcome } = event.data;
  if (type !== PASSPORT_RETURN_MESSAGE_TYPE) return null;
  if (typeof event.data.attemptId !== 'string' || event.data.attemptId !== attemptId) return null;
  if (!isPassportOutcome(outcome)) return null;

  return { attemptId, outcome };
}

/** Acknowledgement payload for one Passport outcome message. Post it to the exact Passport origin. */
export function buildPassportOutcomeAck(messageId: string): PassportOutcomeAck {
  return {
    type: PASSPORT_ACK_MESSAGE_TYPE,
    version: PASSPORT_MESSAGE_VERSION,
    messageId,
  };
}

/** Payload the `/passport/return` page posts to its opener. */
export function buildPassportReturnPostMessage(attemptId: string, outcome: PassportOutcome): PassportReturnPostMessage {
  return {
    type: PASSPORT_RETURN_MESSAGE_TYPE,
    attemptId,
    outcome,
  };
}

/**
 * Read the untrusted `attempt` / `outcome` query parameters of the callback page.
 * Returns `null` unless both are present and the outcome is a known value.
 */
export function parsePassportReturnQuery(search: string): PassportReturnMessage | null {
  const params = new URLSearchParams(search);
  const attemptId = params.get(PASSPORT_RETURN_QUERY.attempt);
  const outcome = params.get(PASSPORT_RETURN_QUERY.outcome);
  if (!attemptId || !isPassportOutcome(outcome)) return null;
  return { attemptId, outcome };
}
