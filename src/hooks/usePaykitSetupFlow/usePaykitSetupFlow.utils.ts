/**
 * postMessage bridge between the Paykit setup iframe and the parent app.
 *
 * The parent embeds Paykit Server's cross-origin `/setup` page in an iframe. Once the creator has
 * approved the payout account, that page posts the result to the parent. The parent validates the
 * message (origin/source/schema) and checks `state`. No auth URL or account material ever crosses
 * the boundary, so the message carries nothing but the outcome.
 */

/** postMessage `type` discriminator for the callback message (must match Paykit's setup page). */
export const PAYKIT_SETUP_MESSAGE_TYPE = 'paykit-setup-callback';

/** Validated payload: the echoed CSRF state, plus `error` when the setup failed. */
type TPaykitSetupBridgeResult = { state: string; error?: string };

/**
 * Validates a `message` event from the Paykit `/setup` iframe and returns its payload, or `null`
 * if the message must be ignored.
 *
 * Rejects unless ALL hold:
 * - origin is the Paykit Server origin (the `/setup` page's own origin, cross-origin to us),
 * - sent by the expected iframe window (guards against other frames/tabs posting),
 * - matches the message schema (`type` + non-empty `state`).
 */
export function readPaykitSetupBridgeMessage(
  event: MessageEvent,
  expectedSource: Window | null,
  paykitOrigin: string,
): TPaykitSetupBridgeResult | null {
  if (event.origin !== paykitOrigin) return null;
  if (!expectedSource) return null;
  if (event.source !== expectedSource) return null;

  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return null;

  const message = data as Record<string, unknown>;
  if (message.type !== PAYKIT_SETUP_MESSAGE_TYPE) return null;

  const { state, error } = message;
  if (typeof state !== 'string' || state.length === 0) return null;

  if (typeof error === 'string' && error.length > 0) return { state, error };
  return { state };
}
