/**
 * Result type for useInviteCodeSignUp.
 */
export interface UseInviteCodeSignUpResult {
  /**
   * Validates the invite code by generating keys and attempting signup.
   * On success: AuthController.signUp has updated auth store; caller should set invite code in store and navigate.
   * On failure: clears onboarding secrets, shows toast, and throws.
   */
  validateAndSignUp: (inviteCode: string) => Promise<void>;
}
