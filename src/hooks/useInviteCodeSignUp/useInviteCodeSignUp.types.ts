/**
 * Result type for useInviteCodeSignUp.
 */
export interface UseInviteCodeSignUpResult {
  /**
   * Validates the invite code by generating keys and attempting signup.
   * On success: AuthController.signUp has updated auth store; caller should set invite code in store and navigate.
   * On failure: shows toast and throws; clears onboarding secrets unless the homeserver may already
   * hold an account for them (retryable failure, 409 conflict, or any failure after one of those).
   */
  validateAndSignUp: (inviteCode: string) => Promise<void>;
}
