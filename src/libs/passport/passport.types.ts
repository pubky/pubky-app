/** Outcome Passport reports for one authorization request. A UI signal only, never a credential. */
export type PassportOutcome = 'success' | 'error' | 'cancel';

/** Validated `pubky-passport.authorization-outcome` message received from the Passport popup. */
export type PassportOutcomeMessage = {
  outcome: PassportOutcome;
  messageId: string;
};

/** Validated message posted by the same-origin static fallback page (`public/passport/return.html`). */
export type PassportReturnMessage = {
  attemptId: string;
  outcome: PassportOutcome;
};

/** Acknowledgement franky posts back to Passport for one outcome message. */
export type PassportOutcomeAck = {
  type: string;
  version: number;
  messageId: string;
};

/** Minimal shape of a `MessageEvent` needed for validation (keeps the helpers testable without DOM types). */
export type PassportMessageEventLike = {
  origin: string;
  source: unknown;
  data: unknown;
};
