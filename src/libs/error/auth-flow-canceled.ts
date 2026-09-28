/**
 * Cancellation sentinel for `pubkyauth://` flows (Pubky Ring QR / deeplink, Pubky Passport popup).
 *
 * Deliberately a plain `Error`, not an `AppError`: cancellation is a control-flow signal (a newer
 * flow superseded this one, the user left, the component tore down), not a failure. It must stay
 * out of Sentry and is recognised by name at every layer that awaits an approval.
 *
 * Layer-neutral on purpose: thrown by the homeserver service's relay poll and by
 * `AuthController.wrapAuthFlow`, and recognised by the auth hooks.
 */
export const AUTH_FLOW_CANCELED_ERROR_NAME = 'AuthFlowCanceled';

/** Creates the canceled sentinel thrown when an auth flow is cancelled or superseded. */
export const createCanceledError = (): Error => {
  const error = new Error('Auth flow canceled');
  error.name = AUTH_FLOW_CANCELED_ERROR_NAME;
  return error;
};

/** True when `error` is the auth-flow cancellation sentinel (matched by name so it survives serialisation). */
export const isAuthFlowCanceledError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error as { name?: unknown }).name === AUTH_FLOW_CANCELED_ERROR_NAME;
