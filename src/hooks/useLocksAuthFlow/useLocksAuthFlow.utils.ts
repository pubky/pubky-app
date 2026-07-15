/**
 * postMessage bridge between the Lock-auth iframe and the parent app.
 *
 * The parent embeds the cross-origin Lock Server `/connect` page in an iframe. After approval, the
 * `/connect` shell posts the one-time `code` (+ `state`) to the parent via `postMessage` — no
 * redirect, no same-origin callback page. The parent validates the message (origin/source/schema),
 * checks `state`, then exchanges the code for a session.
 */

/** postMessage `type` discriminator for the callback message (must match the Lock Server shell). */
export const LOCKS_AUTH_MESSAGE_TYPE = 'locks-auth-callback';

/** Validated success payload: the one-time code + the echoed CSRF state. */
type TLocksAuthBridgeSuccess = { code: string; state: string };
/** Validated failure payload from the Lock Server shell (connect failed / expired). */
type TLocksAuthBridgeFailure = { error: string };
/** Result of reading a bridge message: success, failure, or `null` (reject / ignore). */
type TLocksAuthBridgeResult = TLocksAuthBridgeSuccess | TLocksAuthBridgeFailure;

/**
 * Validates a `message` event from the Lock-auth `/connect` iframe and returns its payload,
 * or `null` if the message must be ignored.
 *
 * Rejects unless ALL hold:
 * - origin is the Lock Server origin (the `/connect` page's own origin, cross-origin to us),
 * - sent by the expected iframe window (guards against other frames/tabs posting),
 * - matches the message schema (`type` + either `error`, or non-empty `code` + `state`).
 */
export function readLocksAuthBridgeMessage(
  event: MessageEvent,
  expectedSource: Window | null,
  lockServerOrigin: string,
): TLocksAuthBridgeResult | null {
  if (event.origin !== lockServerOrigin) return null;
  if (!expectedSource) return null;
  if (event.source !== expectedSource) return null;

  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return null;

  const message = data as Record<string, unknown>;
  if (message.type !== LOCKS_AUTH_MESSAGE_TYPE) return null;

  if (typeof message.error === 'string' && message.error.length > 0) {
    return { error: message.error };
  }

  const { code, state } = message;
  if (typeof code === 'string' && code.length > 0 && typeof state === 'string' && state.length > 0) {
    return { code, state };
  }

  return null;
}
