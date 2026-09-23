/**
 * How one Passport attempt ended. Fired exactly once per attempt through `onAttemptSettled`.
 *
 * Only `failed` means "the user tried Passport and it did not work"; callers that react by
 * regenerating another auth request (the Ring QR on `/sign-in`) must react to `failed` alone.
 */
export type PassportAttemptResult =
  /** The relay returned a session and `initializeAuthenticatedSession` completed. */
  | 'session'
  /** Cancelled, errored, closed without success, timed out, flow error, or initialization failure. */
  | 'failed'
  /**
   * A newer auth flow took over (for example a recovery-phrase sign-in completed while the popup
   * was open). Nothing to retry: the other flow owns the session now.
   */
  | 'superseded'
  /** The browser blocked the popup; no auth flow was started, so nothing was cancelled. */
  | 'popup-blocked';

export type PassportAttemptSettledEvent = {
  attemptId: string;
  result: PassportAttemptResult;
};

export type UsePassportAuthOptions = {
  /** Called once when an attempt settles. Use `result === 'failed'` to regenerate a Ring request, for example. */
  onAttemptSettled?: (event: PassportAttemptSettledEvent) => void;
};

export type UsePassportAuthReturn = {
  /** Start one Passport attempt. Must be called synchronously from a click handler so the popup is not blocked. */
  startPassportAuth: () => void;
  /** True from the click until the attempt settles, including while the session is being initialized. */
  isPending: boolean;
};

/** Why an authorization phase ended without a session. Drives the static toast copy. */
export type PassportFailureReason = 'popup-blocked' | 'cancel' | 'error' | 'popup-closed' | 'timeout' | 'flow-error';
