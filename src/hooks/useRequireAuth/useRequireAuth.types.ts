export interface UseRequireAuthOptions {
  /**
   * Wait in a scope of each call instead of this component's: for an action that a surface outliving the
   * component starts, such as a toast's Undo clicked after its dialog closed. Logout, account replacement
   * and the restore timeout still cancel it. It applies to every waitForAuth of this instance, so closing or
   * navigating never cancels them: give such an action an instance of its own.
   */
  outlivesOwner?: boolean;
}

export interface UseRequireAuthResult {
  /** Whether this account has a ready session. */
  isAuthenticated: boolean;
  isWaiting: boolean;
  /** Synchronous UI interaction; never opens sign-in while restoration is pending. */
  requireAuth: <T>(action: () => T) => T | undefined;
  /** Wait for this account's existing restore before a mutation. Separate targets may use distinct keys. */
  waitForAuth: (actionKey?: string) => Promise<boolean>;
}
