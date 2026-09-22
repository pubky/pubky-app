export const AUTH_FLOW_CANCELED_ERROR_NAME = 'AuthFlowCanceled';

/**
 * Creates a canceled error for auth flows.
 *
 * Uses plain Error (not AppError) intentionally — cancellation is a control flow
 * signal, not an actual error. It's caught by name and handled as a normal exit path.
 *
 * @returns An Error with the canceled error name
 */
export const createCanceledError = (): Error => {
  const error = new Error('Auth flow canceled');
  error.name = AUTH_FLOW_CANCELED_ERROR_NAME;
  return error;
};
