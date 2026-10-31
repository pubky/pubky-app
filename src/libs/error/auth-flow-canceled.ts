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

/** Why an approval was refused: another account than the requested one, or a grant without every requested permission. */
type AuthApprovalMismatchReason = 'identity' | 'capabilities';

/**
 * A user can approve with the wrong account or untick a requested permission; show feedback
 * without reporting a system failure. `reason` lets the UI name the cause.
 */
export function createAuthApprovalMismatchError(reason: AuthApprovalMismatchReason): Error {
  const error = new Error('Approve with the account and permissions requested.');
  error.name = 'AuthApprovalMismatch';
  return Object.assign(error, { reason });
}

export function isAuthApprovalMismatchError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AuthApprovalMismatch';
}

/** True when the approval came from the right account but left out a requested permission. */
export function isAuthApprovalCapabilityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'AuthApprovalMismatch' &&
    'reason' in error &&
    error.reason === 'capabilities'
  );
}
