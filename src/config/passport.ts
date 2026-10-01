/**
 * Pubky Passport ("Continue with Google") integration constants.
 *
 * Passport is a hosted signer: franky starts a normal `pubkyauth://` cookie flow, opens
 * `<passportUrl>/authorize#d=<encoded authorization URL>` in a popup and keeps polling the HTTP
 * relay. Only the SDK `Session` returned by the relay authenticates the user; every message or
 * callback described here is a UI signal.
 *
 * The Passport origin itself is runtime config (`PUBKY_RUNTIME_PASSPORT_URL`, see
 * `@/config/network`). Fixed protocol values live here; see `docs/environment.md`.
 */

/** Human-readable app name Passport shows as the requesting source (`x-source`). Not a verified identity. */
export const PASSPORT_X_SOURCE = 'Pubky';

/** Path Passport is told to open on `/authorize`. The authorization URL travels in the fragment (`#d=`). */
export const PASSPORT_AUTHORIZE_PATH = '/authorize';

/**
 * Same-origin HTTPS callback Passport navigates the popup to when the postMessage hand-off cannot
 * complete. A static file (`public/passport/return.html`), not a Next route: a route under the root
 * layout would boot the session restore inside the popup while the opener is bootstrapping the same
 * origin (see `docs/pwa.md` for the same rule on the offline page). This is the single source of the
 * path; the page's inline script mirrors {@link PASSPORT_RETURN_MESSAGE_TYPE} and
 * {@link PASSPORT_RETURN_QUERY}.
 */
export const PASSPORT_RETURN_PATH = '/passport/return.html';

/** Query parameter names on {@link PASSPORT_RETURN_PATH}. Untrusted: they never sign the user in. */
export const PASSPORT_RETURN_QUERY = {
  attempt: 'attempt',
  outcome: 'outcome',
} as const;

/** Window features for the Passport popup. `noopener`/`noreferrer` must not be used: Passport needs `window.opener`. */
export const PASSPORT_POPUP_FEATURES = 'popup,width=520,height=760';

/** Prefix of the popup window name; the attempt id is appended so each attempt targets its own window. */
export const PASSPORT_POPUP_NAME_PREFIX = 'pubky-passport-';

/** `postMessage` contract sent by Passport to the opener (see pubky-passport `docs/integration.md`). */
export const PASSPORT_OUTCOME_MESSAGE_TYPE = 'pubky-passport.authorization-outcome';

/** Acknowledgement franky posts back to Passport so it can close instead of navigating to the callback. */
export const PASSPORT_ACK_MESSAGE_TYPE = 'pubky-passport.authorization-outcome-ack';

/** Message the same-origin callback page posts to the opener when Passport fell back to navigation. */
export const PASSPORT_RETURN_MESSAGE_TYPE = 'pubky-app.passport-return';

/** Version of the Passport outcome/ack message contract franky understands. */
export const PASSPORT_MESSAGE_VERSION = 1;

/** Interval for detecting that the user closed the popup before Passport reported an outcome. */
export const PASSPORT_POPUP_CLOSED_POLL_MS = 500;

/**
 * Consecutive closed observations before a closed popup fails the attempt. The callback page
 * posts its outcome and closes in the same tick, so a single observation could race the message.
 */
export const PASSPORT_POPUP_CLOSED_CONFIRMATIONS = 2;

/**
 * Wall-clock bound for the authorization phase of one Passport attempt. The relay poll helper only
 * bounds the number of polls, so a hung request could otherwise wait indefinitely. Cleared as soon
 * as the SDK session is accepted; initialization is not subject to it.
 */
export const PASSPORT_ATTEMPT_TIMEOUT_MS = 5 * 60_000;
