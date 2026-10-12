export interface UseRequireAuthResult {
  /** Whether this account has a ready session. */
  isAuthenticated: boolean;
  isWaiting: boolean;
  /** Synchronous UI interaction; never opens sign-in while restoration is pending. */
  requireAuth: <T>(action: () => T) => T | undefined;
  /** Wait for this account's existing restore before a mutation. Separate targets may use distinct keys. */
  waitForAuth: (actionKey?: string) => Promise<boolean>;
}
