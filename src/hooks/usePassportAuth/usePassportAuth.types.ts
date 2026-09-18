/** How one Passport attempt ended. Fired exactly once per attempt through `onAttemptSettled`. */
export type PassportAttemptResult =
  /** The relay returned a session and `initializeAuthenticatedSession` completed. */
  | 'session'
  /** Popup blocked, cancelled, error, closed without success, authorization timeout, or initialization failure. */
  | 'failed';

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
